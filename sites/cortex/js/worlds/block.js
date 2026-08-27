import * as THREE from 'three';
import { BLOCK_STAGES } from '../data/blockStages.js';
import { addStandardLighting, createDeck, createLabel, THEME } from '../utils/sceneKit.js';
import { createStageModule, setModuleState } from '../utils/blockModules.js';
import { tween, Easing } from '../utils/tween.js';

const TOP_Y = 2.2;
const SPACING = 1.0;
// LayerNorm teal, attention blue, residual amber, MLP violet — the same
// colour means the same kind of operation everywhere in the exhibit.
const STAGE_COLORS = [ THEME.accent, THEME.info, THEME.signal, THEME.accent, THEME.violet, THEME.signal ];

// A residual skip drawn as a quadratic bezier rather than a Catmull-Rom
// spline: the bezier stays inside its control triangle, so the arc bulges out
// to one side by exactly `sideOffset` instead of overshooting past the module
// stack and wandering off screen.
function skipTube( from, to, sideOffset, color ) {

	const control = from.clone().add( to ).multiplyScalar( 0.5 );
	control.x += sideOffset;
	const curve = new THREE.QuadraticBezierCurve3( from.clone(), control, to.clone() );
	const geo = new THREE.TubeGeometry( curve, 32, 0.022, 8, false );
	const mat = new THREE.MeshBasicMaterial( { color, transparent: true, opacity: 0.4 } );
	return new THREE.Mesh( geo, mat );

}

export function buildBlockWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene );
	scene.add( createDeck( 26, { y: -3.4, divisions: 52 } ) );

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

		const label = createLabel( `${ i + 1 }. ${ stage.title }`, 'label2d label2d-key' );
		label.position.set( 1.9, 0.12, 0 );
		mod.add( label );

		const formula = createLabel( stage.formula, 'label2d label2d-dim' );
		formula.position.set( 1.9, -0.18, 0 );
		mod.add( formula );

		nodes.push( mod );
		allLinks.push( ...mod.userData.links );

	} );

	// Residual "skip" connections: input -> after first residual, and after
	// first residual -> after second residual — a literal 3D payoff for what
	// the source material could only show as an ASCII arrow diagram.
	const inputPoint = new THREE.Vector3( 0, TOP_Y + SPACING * 0.6, 0 );
	const firstResidual = nodes[ 2 ].position;
	const secondResidual = nodes[ 5 ].position;

	rig.add( skipTube( inputPoint, firstResidual, -1.9, THEME.signal ) );
	rig.add( skipTube( firstResidual, secondResidual, -1.9, THEME.signal ) );

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
			position: new THREE.Vector3( 1.4, TOP_Y - SPACING * 2.5 + 4.2, 18.0 ),
			target: new THREE.Vector3( 0.4, TOP_Y - SPACING * 2.6, 0 ),
		},
		// The whole ladder stays in frame at every stage; the camera only drifts
		// a little towards the active module rather than zooming into it, so the
		// residual paths connecting the stages never leave the screen.
		getStepView( index ) {

			const n = nodes[ Math.max( 0, Math.min( nodes.length - 1, index ) ) ];
			const centre = TOP_Y - SPACING * 2.5;
			const drift = ( n.position.y - centre ) * 0.3;
			return {
				position: new THREE.Vector3( 1.4, centre + drift + 4.2, 18.0 ),
				target: new THREE.Vector3( 0.4, centre + drift, 0 ),
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
