import * as THREE from 'three';
import { BLOCK_STAGES } from '../data/blockStages.js';
import { addStandardLighting, createStarfield, createLabel } from '../utils/sceneKit.js';
import { createStageModule, setModuleState } from '../utils/blockModules.js';
import { tween, Easing } from '../utils/tween.js';

const TOP_Y = 2.0;
const SPACING = 0.85;
const STAGE_COLORS = [ 0x35d0ba, 0x8b7bff, 0xff5da2, 0x35d0ba, 0x8b7bff, 0xff5da2 ];

function skipTube( from, to, sideOffset, color ) {

	const mid = from.clone().add( to ).multiplyScalar( 0.5 );
	mid.x += sideOffset;
	const curve = new THREE.CatmullRomCurve3( [ from.clone(), mid, to.clone() ] );
	const geo = new THREE.TubeGeometry( curve, 32, 0.02, 8, false );
	const mat = new THREE.MeshBasicMaterial( { color, transparent: true, opacity: 0.35 } );
	return new THREE.Mesh( geo, mat );

}

export function buildBlockWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene, 0x8b7bff );
	scene.add( createStarfield() );

	const rig = new THREE.Group();
	scene.add( rig );

	const nodes = [];
	const allLinks = [];

	BLOCK_STAGES.forEach( ( stage, i ) => {

		const y = TOP_Y - i * SPACING;
		const mod = createStageModule( stage.type, {
			scale: 1,
			color: STAGE_COLORS[ i ],
			accentColor: STAGE_COLORS[ ( i + 1 ) % STAGE_COLORS.length ],
		} );
		mod.position.set( 0, y, 0 );
		mod.userData.stepIndex = i;
		rig.add( mod );

		const label = createLabel( `${ i + 1 }. ${ stage.title }`, 'label2d label2d-dim' );
		label.position.set( 1.7, 0, 0 );
		mod.add( label );

		nodes.push( mod );
		allLinks.push( ...mod.userData.links );

	} );

	// Residual "skip" connections: input -> after first residual, and after
	// first residual -> after second residual — a literal 3D payoff for what
	// the source material could only show as an ASCII arrow diagram.
	const inputPoint = new THREE.Vector3( 0, TOP_Y + SPACING * 0.6, 0 );
	const firstResidual = nodes[ 2 ].position;
	const secondResidual = nodes[ 5 ].position;

	rig.add( skipTube( inputPoint, firstResidual, 1.7, 0xff5da2 ) );
	rig.add( skipTube( firstResidual, secondResidual, 1.7, 0xff5da2 ) );

	function highlight( index ) {

		nodes.forEach( ( node, i ) => {

			const active = i === index;
			const done = i < index;
			const targetScale = active ? 1.08 : 1;
			tween( 0.4, ( t ) => {

				const s = THREE.MathUtils.lerp( node.scale.x, targetScale, t );
				node.scale.set( s, 1, s );

			}, { easing: Easing.backOut } );
			setModuleState( node, active ? 'active' : ( done ? 'done' : 'pending' ) );

		} );

	}

	highlight( 0 );

	return {
		scene,
		interactables: nodes,
		totalSteps: BLOCK_STAGES.length,
		defaultView: {
			position: new THREE.Vector3( 3.4, TOP_Y, 4.8 ),
			target: new THREE.Vector3( 0, TOP_Y - SPACING * 2.5, 0 ),
		},
		getStepView( index ) {

			const n = nodes[ Math.max( 0, Math.min( nodes.length - 1, index ) ) ];
			return {
				position: new THREE.Vector3( 3.2, n.position.y + 0.3, 3.6 ),
				target: new THREE.Vector3( 0, n.position.y, 0 ),
			};

		},
		goToStep( index ) {

			highlight( Math.max( 0, Math.min( nodes.length - 1, index ) ) );

		},
		update( dt ) {

			for ( const link of allLinks ) link.update( dt );

		},
	};

}
