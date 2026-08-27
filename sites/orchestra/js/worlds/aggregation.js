import * as THREE from 'three';
import { AGGREGATION_STEPS } from '../data/aggregationSteps.js';
import { addStandardLighting, createDeck, createLabel, THEME } from '../utils/sceneKit.js';
import { assess, DISAGREEMENT_THRESHOLD } from '../data/council.js';
import { IPCLink } from '../utils/ipcLink.js';
import { tween, Easing } from '../utils/tween.js';

const SPACING = 2.4;
const LOW_COLOR = THEME.ok;
const HIGH_COLOR = THEME.signal;

export function buildAggregationWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene );
	scene.add( createDeck( 30, { y: -2.2, divisions: 60 } ) );

	const result = assess();

	const rig = new THREE.Group();
	scene.add( rig );

	const total = AGGREGATION_STEPS.length;
	const offset = ( ( total - 1 ) * SPACING ) / 2;
	const nodes = [];

	AGGREGATION_STEPS.forEach( ( step, i ) => {

		const geo = new THREE.OctahedronGeometry( 0.34, 0 );
		const mat = new THREE.MeshStandardMaterial( { color: THEME.accent, emissive: THEME.accent, emissiveIntensity: 0.3, roughness: 0.35, metalness: 0.3 } );
		const node = new THREE.Mesh( geo, mat );
		node.position.set( i * SPACING - offset, 0, 0 );
		node.userData.stepIndex = i;
		rig.add( node );

		// Stagger the captions above and below the chain so four wide labels in
		// a row never collide.
		const label = createLabel( `${ i + 1 }. ${ step.title }`, 'label2d label2d-key' );
		label.position.set( 0, i % 2 === 0 ? 0.62 : -0.5, 0 );
		node.add( label );

		nodes.push( node );

		if ( i > 0 ) {

			new IPCLink( rig, nodes[ i - 1 ].position.clone(), node.position.clone(), THEME.accent, { particleCount: 2, speed: 0.4, radius: 0.018, arc: 0.3 } );

		}

	} );

	// Decision diamond sits above the "measure the disagreement" node (index 2),
	// which is the step that actually decides whether the loop runs again.
	const diamondGeo = new THREE.OctahedronGeometry( 0.26, 0 );
	const diamondMat = new THREE.MeshStandardMaterial( { color: LOW_COLOR, emissive: LOW_COLOR, emissiveIntensity: 0.9, roughness: 0.25, metalness: 0.3 } );
	const diamond = new THREE.Mesh( diamondGeo, diamondMat );
	diamond.position.set( nodes[ 2 ].position.x, 0.95, 0 );
	rig.add( diamond );

	const diamondLabel = createLabel(
		`spread ${ ( result.soh.relativeSpread * 100 ).toFixed( 2 ) }% vs τ ${ ( DISAGREEMENT_THRESHOLD * 100 ).toFixed( 1 ) }%`,
		'label2d label2d-dim',
	);
	diamondLabel.position.set( 0, 0.45, 0 );
	diamond.add( diamondLabel );

	// Loop-back link from the decision node to step 1, only lit up when the
	// council disagrees and the pipeline needs to refine its weights.
	const loopLink = new IPCLink( rig, nodes[ 2 ].position.clone(), nodes[ 1 ].position.clone(), HIGH_COLOR, { particleCount: 3, speed: 0.5, radius: 0.022, arc: -1.3 } );
	loopLink.setActive( false );

	// The council in this exhibit converges, so the loop-back path is drawn but
	// dark; it only lights up while the "what if it did not converge" state is
	// being shown.
	let highDisagreement = false;

	function setDisagreement( state ) {

		highDisagreement = state;
		const color = highDisagreement ? HIGH_COLOR : LOW_COLOR;
		diamond.material.color.setHex( color );
		diamond.material.emissive.setHex( color );
		loopLink.setActive( highDisagreement );
		diamondLabel.element.textContent = highDisagreement
			? `spread over τ ${ ( DISAGREEMENT_THRESHOLD * 100 ).toFixed( 1 ) }% — reweight`
			: `spread ${ ( result.soh.relativeSpread * 100 ).toFixed( 2 ) }% under τ ${ ( DISAGREEMENT_THRESHOLD * 100 ).toFixed( 1 ) }% — converged`;

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

		setDisagreement( false );

	}

	highlight( 0 );

	let elapsed = 0;

	return {
		scene,
		interactables: nodes,
		totalSteps: total,
		defaultView: {
			position: new THREE.Vector3( -0.6, 2.2, 17.0 ),
			target: new THREE.Vector3( -0.6, 0.3, 0 ),
		},
		setDisagreement,
		result,
		getStepView( index ) {

			const n = nodes[ Math.max( 0, Math.min( total - 1, index ) ) ];
			// Drift a little towards the active node without losing the loop.
			const x = n.position.x * 0.25 - 0.6;
			return {
				position: new THREE.Vector3( x, 2.2, 17.0 ),
				target: new THREE.Vector3( x, 0.3, 0 ),
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
