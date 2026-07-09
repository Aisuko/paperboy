import * as THREE from 'three';
import { AGGREGATION_STEPS } from '../data/aggregationSteps.js';
import { addStandardLighting, createStarfield, createFloor, createLabel } from '../utils/sceneKit.js';
import { IPCLink } from '../utils/ipcLink.js';
import { tween, Easing } from '../utils/tween.js';

const SPACING = 2.3;
const LOW_COLOR = 0x10b981;
const HIGH_COLOR = 0xf5a623;

export function buildAggregationWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene, 0x06b6d4 );
	scene.add( createStarfield() );
	scene.add( createFloor( 7, 0x0c1620 ) );

	const rig = new THREE.Group();
	scene.add( rig );

	const total = AGGREGATION_STEPS.length;
	const offset = ( ( total - 1 ) * SPACING ) / 2;
	const nodes = [];

	AGGREGATION_STEPS.forEach( ( step, i ) => {

		const geo = new THREE.IcosahedronGeometry( 0.34, 0 );
		const mat = new THREE.MeshStandardMaterial( { color: 0x06b6d4, emissive: 0x06b6d4, emissiveIntensity: 0.3, roughness: 0.35, metalness: 0.3 } );
		const node = new THREE.Mesh( geo, mat );
		node.position.set( i * SPACING - offset, 0, 0 );
		node.userData.stepIndex = i;
		rig.add( node );

		const label = createLabel( `${ i + 1 }. ${ step.title }`, 'label2d label2d-dim' );
		label.position.set( 0, 0.55, 0 );
		node.add( label );

		nodes.push( node );

		if ( i > 0 ) {

			new IPCLink( rig, nodes[ i - 1 ].position.clone(), node.position.clone(), 0x06b6d4, { particleCount: 2, speed: 0.4, radius: 0.018, arc: 0.3 } );

		}

	} );

	// Decision diamond sits above the "detect disagreement" node (index 1).
	const diamondGeo = new THREE.OctahedronGeometry( 0.26, 0 );
	const diamondMat = new THREE.MeshStandardMaterial( { color: LOW_COLOR, emissive: LOW_COLOR, emissiveIntensity: 0.9, roughness: 0.25, metalness: 0.3 } );
	const diamond = new THREE.Mesh( diamondGeo, diamondMat );
	diamond.position.set( nodes[ 1 ].position.x, 0.75, 0 );
	rig.add( diamond );

	// Loop-back link from the decision node to step 1, only lit up when the
	// council disagrees and the pipeline needs to refine its weights.
	const loopLink = new IPCLink( rig, nodes[ 1 ].position.clone(), nodes[ 0 ].position.clone(), HIGH_COLOR, { particleCount: 3, speed: 0.5, radius: 0.022, arc: -1.1 } );
	loopLink.setActive( false );

	let highDisagreement = false;

	function setDisagreement( state ) {

		highDisagreement = state;
		const color = highDisagreement ? HIGH_COLOR : LOW_COLOR;
		diamond.material.color.setHex( color );
		diamond.material.emissive.setHex( color );
		loopLink.setActive( highDisagreement );

	}

	function highlight( index ) {

		nodes.forEach( ( node, i ) => {

			const active = i === index;
			const done = i < index;
			const targetScale = active ? 1.4 : 1;
			tween( 0.45, ( t ) => {

				const s = THREE.MathUtils.lerp( node.scale.x, targetScale, t );
				node.scale.setScalar( s );

			}, { easing: Easing.backOut } );
			node.material.emissiveIntensity = active ? 0.95 : ( done ? 0.5 : 0.25 );

		} );

		if ( index === 1 ) setDisagreement( ! highDisagreement );

	}

	highlight( 0 );

	let elapsed = 0;

	return {
		scene,
		interactables: nodes,
		totalSteps: total,
		defaultView: {
			position: new THREE.Vector3( nodes[ 0 ].position.x, 1.6, 4.2 ),
			target: new THREE.Vector3( nodes[ 0 ].position.x, 0, 0 ),
		},
		getStepView( index ) {

			const n = nodes[ Math.max( 0, Math.min( total - 1, index ) ) ];
			return {
				position: new THREE.Vector3( n.position.x, 1.6, 4.4 ),
				target: new THREE.Vector3( n.position.x, 0.1, 0 ),
			};

		},
		goToStep( index ) {

			highlight( Math.max( 0, Math.min( total - 1, index ) ) );

		},
		update( dt ) {

			elapsed += dt;
			diamond.rotation.y += dt * 0.6;
			diamond.rotation.x += dt * 0.3;
			loopLink.update( dt );

		},
	};

}
