import * as THREE from 'three';
import { addStandardLighting, createDeck, createOrbNode, createLabel, THEME } from '../utils/sceneKit.js';
import { assess, SOH_AGENTS, combine, robustCombine, DISAGREEMENT_THRESHOLD } from '../data/council.js';
import { IPCLink } from '../utils/ipcLink.js';
import { tween, Easing } from '../utils/tween.js';

const SINGLE_X = -3.4;
const COUNCIL_X = 3.4;
const GOOD_COLOR = THEME.ok;
const BAD_COLOR = THEME.danger;

// One agent's capacity sensor goes bad and it reports 61.6% instead of 94.2%.
//
// Naive weighting does *not* save the council here — a confident wrong agent
// drags the mean down to 78.6%. What saves it is that the disagreement is
// measurable: spread jumps to 24% against a 1.5% threshold, the aggregation
// loop fires, the outlier is rejected, and the consensus comes back. A single
// estimator has no equivalent signal, which is the actual argument for a
// council.
const DRIFTED_AGENTS = [ { ...SOH_AGENTS[ 0 ], estimate: 61.6 }, SOH_AGENTS[ 1 ], SOH_AGENTS[ 2 ] ];
const BASELINE = assess();
const NAIVE = combine( DRIFTED_AGENTS );
const RECOVERED = robustCombine( DRIFTED_AGENTS );

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
	addStandardLighting( scene );
	scene.add( createDeck( 26, { y: -2.0, divisions: 52 } ) );

	const rig = new THREE.Group();
	scene.add( rig );

	// ---- Single-estimator column ----
	const singleGroup = new THREE.Group();
	singleGroup.position.x = SINGLE_X;
	rig.add( singleGroup );

	const singleOrb = createOrbNode( { color: GOOD_COLOR, radius: 0.4, emissiveIntensity: 1.2 } );
	singleGroup.add( singleOrb );
	const singleTitle = createLabel( 'single estimator', 'label2d label2d-key' );
	singleTitle.position.set( 0, 1.0, 0 );
	singleGroup.add( singleTitle );
	const singleReading = createLabel( `SOH ${ BASELINE.soh.value.toFixed( 1 ) }%`, 'label2d label2d-dim' );
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

	const councilTitle = createLabel( 'agent council', 'label2d label2d-key' );
	councilTitle.position.set( 0, 1.0, 0 );
	councilGroup.add( councilTitle );
	const councilReading = createLabel( `SOH ${ BASELINE.soh.value.toFixed( 1 ) }%`, 'label2d label2d-dim' );
	councilReading.position.set( 0, -0.7, 0 );
	councilGroup.add( councilReading );

	let running = false;

	async function triggerDrift( setNote ) {

		if ( running ) return;
		running = true;

		setNote( 'Single estimator: a corrupted capacity reading feeds straight into the estimate. There is nothing to check it against.' );
		await tweenAsync( 1.0, ( t ) => {

			const flash = 0.5 + 0.5 * Math.sin( t * Math.PI * 8 );
			singleOrb.material.color.lerpColors( new THREE.Color( GOOD_COLOR ), new THREE.Color( BAD_COLOR ), t );
			singleOrb.material.emissive.copy( singleOrb.material.color );
			singleOrb.material.emissiveIntensity = 1.2 + flash * 0.8;
			const fakeValue = BASELINE.soh.value - t * ( BASELINE.soh.value - 61.6 ) + flash * 4;
			singleReading.element.textContent = `SOH ${ fakeValue.toFixed( 1 ) }%  (wrong)`;

		} );
		await wait( 500 );

		setNote( `Agent council: the same agent drifts to 61.6%. Weighted naively the consensus follows it down to ${ NAIVE.value.toFixed( 1 ) }% — a council alone is not enough.` );
		const badMember = members[ 0 ];
		await tweenAsync( 1.0, ( t ) => {

			badMember.material.color.lerpColors( new THREE.Color( GOOD_COLOR ), new THREE.Color( BAD_COLOR ), t );
			badMember.material.emissive.copy( badMember.material.color );
			const wobble = Math.sin( t * Math.PI * 2 ) * 0.4;
			councilCore.scale.setScalar( 1 + wobble * 0.08 );
			councilReading.element.textContent = `SOH ${ ( BASELINE.soh.value - t * ( BASELINE.soh.value - NAIVE.value ) ).toFixed( 1 ) }%`;

		} );
		await wait( 500 );

		setNote( `But disagreement is now ${ ( NAIVE.relativeSpread * 100 ).toFixed( 1 ) }% against a ${ ( DISAGREEMENT_THRESHOLD * 100 ).toFixed( 1 ) }% threshold. The loop fires, the outlier is rejected, and the consensus returns to ${ RECOVERED.value.toFixed( 1 ) }% ± ${ RECOVERED.sigma.toFixed( 2 ) }.` );
		await tweenAsync( 0.8, ( t ) => {

			badMember.material.color.lerpColors( new THREE.Color( BAD_COLOR ), new THREE.Color( GOOD_COLOR ), t );
			badMember.material.emissive.copy( badMember.material.color );
			councilReading.element.textContent = `SOH ${ ( NAIVE.value + t * ( RECOVERED.value - NAIVE.value ) ).toFixed( 1 ) }%`;

		} );

		running = false;

	}

	function reset() {

		singleOrb.material.color.set( GOOD_COLOR );
		singleOrb.material.emissive.set( GOOD_COLOR );
		singleOrb.material.emissiveIntensity = 1.2;
		singleReading.element.textContent = `SOH ${ BASELINE.soh.value.toFixed( 1 ) }%`;
		members.forEach( ( m ) => { m.material.color.set( GOOD_COLOR ); m.material.emissive.set( GOOD_COLOR ); } );
		councilReading.element.textContent = `SOH ${ BASELINE.soh.value.toFixed( 1 ) }%`;
		councilCore.scale.setScalar( 1 );

	}

	return {
		scene,
		interactables: [],
		triggerDrift,
		reset,
		defaultView: {
			position: new THREE.Vector3( -0.5, 1.9, 11.2 ),
			target: new THREE.Vector3( -0.5, -0.15, 0 ),
		},
		baseline: BASELINE,
		naive: NAIVE,
		recovered: RECOVERED,
		update( dt ) {

			for ( const link of councilLinks ) link.update( dt );

		},
	};

}
