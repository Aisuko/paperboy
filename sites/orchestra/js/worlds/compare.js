import * as THREE from 'three';
import { addStandardLighting, createStarfield, createFloor, createOrbNode, createLabel } from '../utils/sceneKit.js';
import { IPCLink } from '../utils/ipcLink.js';
import { tween, Easing } from '../utils/tween.js';

const SINGLE_X = -2.6;
const COUNCIL_X = 2.6;
const GOOD_COLOR = 0x10b981;
const BAD_COLOR = 0xff2d4c;

function tweenAsync( duration, onUpdate, opts = {} ) {

	return new Promise( ( resolve ) => {

		tween( duration, onUpdate, { ...opts, onComplete: () => { if ( opts.onComplete ) opts.onComplete(); resolve(); } } );

	} );

}

function wait( ms ) {

	return new Promise( ( resolve ) => setTimeout( resolve, ms ) );

}

export function buildCompareWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene, 0xff5da2 );
	scene.add( createStarfield() );
	scene.add( createFloor( 7, 0x120f18 ) );

	const rig = new THREE.Group();
	scene.add( rig );

	// ---- Single-estimator column ----
	const singleGroup = new THREE.Group();
	singleGroup.position.x = SINGLE_X;
	rig.add( singleGroup );

	const singleOrb = createOrbNode( { color: GOOD_COLOR, radius: 0.4, emissiveIntensity: 1.2 } );
	singleGroup.add( singleOrb );
	const singleTitle = createLabel( 'Single Estimator', 'label2d' );
	singleTitle.position.set( 0, 1.0, 0 );
	singleGroup.add( singleTitle );
	const singleReading = createLabel( 'SOH: 94.2%', 'label2d label2d-dim' );
	singleReading.position.set( 0, -0.7, 0 );
	singleGroup.add( singleReading );

	// ---- Agent-council column ----
	const councilGroup = new THREE.Group();
	councilGroup.position.x = COUNCIL_X;
	rig.add( councilGroup );

	const councilCore = createOrbNode( { color: GOOD_COLOR, radius: 0.28, emissiveIntensity: 1.3 } );
	councilGroup.add( councilCore );

	const memberPositions = [
		new THREE.Vector3( -0.7, 0.35, 0.3 ),
		new THREE.Vector3( 0.75, 0.3, -0.1 ),
		new THREE.Vector3( 0, -0.15, -0.7 ),
	];
	const members = memberPositions.map( ( pos ) => {

		const orb = createOrbNode( { color: GOOD_COLOR, radius: 0.16 } );
		orb.position.copy( pos );
		councilGroup.add( orb );
		return orb;

	} );
	// IPCLink appends its tube + particles directly onto the parent passed in
	// (councilGroup), so the links only need to be tracked here for their
	// per-frame update() call below — not re-added to the scene graph.
	const councilLinks = memberPositions.map( ( pos ) => new IPCLink( councilGroup, pos.clone(), new THREE.Vector3( 0, 0, 0 ), GOOD_COLOR, { particleCount: 2, speed: 0.4, radius: 0.016, arc: 0.4 } ) );

	const councilTitle = createLabel( 'Agent Council', 'label2d' );
	councilTitle.position.set( 0, 1.0, 0 );
	councilGroup.add( councilTitle );
	const councilReading = createLabel( 'SOH: 94.2%', 'label2d label2d-dim' );
	councilReading.position.set( 0, -0.7, 0 );
	councilGroup.add( councilReading );

	let running = false;

	async function triggerDrift( setNote ) {

		if ( running ) return;
		running = true;

		setNote( 'Single estimator: a corrupted sensor reading feeds straight into the estimate — nothing to check it against.' );
		await tweenAsync( 1.0, ( t ) => {

			const flash = 0.5 + 0.5 * Math.sin( t * Math.PI * 8 );
			singleOrb.material.color.lerpColors( new THREE.Color( GOOD_COLOR ), new THREE.Color( BAD_COLOR ), t );
			singleOrb.material.emissive.copy( singleOrb.material.color );
			singleOrb.material.emissiveIntensity = 1.2 + flash * 0.8;
			const fakeValue = 94.2 - t * 32.6 + flash * 6;
			singleReading.element.textContent = `SOH: ${ fakeValue.toFixed( 1 ) }% (wrong)`;

		} );
		await wait( 500 );

		setNote( 'Agent council: one agent drifts the same way, but the others outvote it — the consensus barely moves.' );
		const badMember = members[ 0 ];
		await tweenAsync( 1.0, ( t ) => {

			badMember.material.color.lerpColors( new THREE.Color( GOOD_COLOR ), new THREE.Color( BAD_COLOR ), t );
			badMember.material.emissive.copy( badMember.material.color );
			const wobble = Math.sin( t * Math.PI * 2 ) * 0.4;
			councilCore.scale.setScalar( 1 + wobble * 0.08 );
			councilReading.element.textContent = `SOH: ${ ( 94.2 - t * 0.6 ).toFixed( 1 ) }%`;

		} );
		await wait( 500 );

		setNote( 'The council reweights around the disagreement and recovers on its own — no restart needed.' );
		await tweenAsync( 0.8, ( t ) => {

			badMember.material.color.lerpColors( new THREE.Color( BAD_COLOR ), new THREE.Color( GOOD_COLOR ), t );
			badMember.material.emissive.copy( badMember.material.color );
			councilReading.element.textContent = `SOH: ${ ( 93.6 + t * 0.6 ).toFixed( 1 ) }%`;

		} );

		running = false;

	}

	function reset() {

		singleOrb.material.color.set( GOOD_COLOR );
		singleOrb.material.emissive.set( GOOD_COLOR );
		singleOrb.material.emissiveIntensity = 1.2;
		singleReading.element.textContent = 'SOH: 94.2%';
		members.forEach( ( m ) => { m.material.color.set( GOOD_COLOR ); m.material.emissive.set( GOOD_COLOR ); } );
		councilReading.element.textContent = 'SOH: 94.2%';
		councilCore.scale.setScalar( 1 );

	}

	return {
		scene,
		interactables: [],
		triggerDrift,
		reset,
		defaultView: {
			position: new THREE.Vector3( 0, 1.8, 6.4 ),
			target: new THREE.Vector3( 0, 0, 0 ),
		},
		update( dt ) {

			for ( const link of councilLinks ) link.update( dt );

		},
	};

}
