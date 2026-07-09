import * as THREE from 'three';
import { VOCAB, CORRECT_TOKEN_ID } from '../data/vocab.js';
import { addStandardLighting, createStarfield, createFloor, createBarMesh, createLabel } from '../utils/sceneKit.js';
import { tween, Easing } from '../utils/tween.js';

const SPACING = 0.75;
const BAR_MAX_HEIGHT = 2.2;
const BASE_COLOR = 0x8b7bff;
const CORRECT_COLOR = 0x35d0ba;
const DIM_COLOR = 0x33324a;

function logitHeight( logit ) {

	return Math.max( 0.05, ( logit + 1 ) * 0.6 );

}

function probHeight( prob ) {

	return Math.max( 0.02, prob * BAR_MAX_HEIGHT );

}

export function buildDecodeWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene, 0xff5da2 );
	scene.add( createStarfield() );
	scene.add( createFloor( 6, 0x140e18 ) );

	const rig = new THREE.Group();
	scene.add( rig );

	const offset = ( ( VOCAB.length - 1 ) * SPACING ) / 2;
	const bars = [];

	VOCAB.forEach( ( entry, i ) => {

		const color = entry.id === CORRECT_TOKEN_ID ? CORRECT_COLOR : BASE_COLOR;
		const bar = createBarMesh( { width: 0.36, depth: 0.36, height: BAR_MAX_HEIGHT, color } );
		bar.scale.y = logitHeight( entry.logit ) / BAR_MAX_HEIGHT;
		bar.position.set( i * SPACING - offset, -1.1, 0 );
		bar.userData.baseColor = color;
		bar.userData.detail = {
			category: 'Vocabulary logit',
			name: entry.token,
			blurb: `logit ${ entry.logit.toFixed( 2 ) } · softmax probability ${ entry.prob.toFixed( 2 ) }`,
			description: '',
		};
		rig.add( bar );

		const label = createLabel( entry.token, 'label2d label2d-dim' );
		label.position.set( 0, BAR_MAX_HEIGHT + 0.3, 0 );
		bar.add( label );

		bars.push( { mesh: bar, entry } );

	} );

	let stage = 0; // 0 = logits, 1 = softmax

	function showStage( index ) {

		stage = index;
		bars.forEach( ( { mesh, entry } ) => {

			const targetFrac = ( stage === 0 ? logitHeight( entry.logit ) : probHeight( entry.prob ) ) / BAR_MAX_HEIGHT;
			tween( 0.6, ( t ) => {

				mesh.scale.y = THREE.MathUtils.lerp( mesh.scale.y, targetFrac, t );

			}, { easing: Easing.cubicOut } );

		} );

	}

	function highlightSampling( pickIds ) {

		bars.forEach( ( { mesh, entry } ) => {

			const picked = ! pickIds || pickIds.includes( entry.id );
			const color = picked ? mesh.userData.baseColor : DIM_COLOR;
			mesh.material.color.setHex( color );
			mesh.material.emissive.setHex( color );
			mesh.material.emissiveIntensity = picked ? 0.6 : 0.15;

		} );

	}

	return {
		scene,
		interactables: bars.map( ( b ) => b.mesh ),
		defaultView: {
			position: new THREE.Vector3( 0, 0.4, 5.2 ),
			target: new THREE.Vector3( 0, -0.6, 0 ),
		},
		showStage,
		highlightSampling,
		update() {},
	};

}
