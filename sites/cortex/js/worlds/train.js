import * as THREE from 'three';
import { VOCAB, CORRECT_TOKEN_ID, NLL_EXAMPLE } from '../data/vocab.js';
import { addStandardLighting, createStarfield, createFloor, createBarMesh, createLabel } from '../utils/sceneKit.js';
import { tween, Easing } from '../utils/tween.js';

const SPACING = 0.75;
const BAR_MAX_HEIGHT = 2.2;
const NLL_STICK_MAX = 2.4;

export function buildTrainWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene, 0xf5a623 );
	scene.add( createStarfield() );
	scene.add( createFloor( 6, 0x18130e ) );

	const rig = new THREE.Group();
	scene.add( rig );

	const offset = ( ( VOCAB.length - 1 ) * SPACING ) / 2;
	let correctBar = null;

	VOCAB.forEach( ( entry, i ) => {

		const isCorrect = entry.id === CORRECT_TOKEN_ID;
		const color = isCorrect ? 0xf5a623 : 0x33324a;
		const bar = createBarMesh( { width: 0.36, depth: 0.36, height: BAR_MAX_HEIGHT, color } );
		bar.scale.y = Math.max( 0.02, entry.prob );
		bar.position.set( i * SPACING - offset, -1.1, 0 );
		bar.material.emissiveIntensity = isCorrect ? 0.9 : 0.15;
		rig.add( bar );

		const label = createLabel( entry.token, 'label2d label2d-dim' );
		label.position.set( 0, BAR_MAX_HEIGHT + 0.3, 0 );
		bar.add( label );

		if ( isCorrect ) correctBar = bar;

	} );

	// A "loss stick" next to the correct-token bar, height = NLL magnitude.
	const nllStick = createBarMesh( { width: 0.16, depth: 0.16, height: NLL_STICK_MAX, color: 0xff5da2 } );
	nllStick.scale.y = 0.001;
	nllStick.position.set( correctBar.position.x + 0.55, -1.1, 0 );
	rig.add( nllStick );
	const nllLabel = createLabel( 'NLL = 0.00', 'label2d' );
	nllLabel.position.set( 0, NLL_STICK_MAX + 0.3, 0 );
	nllStick.add( nllLabel );

	correctBar.userData.detail = {
		category: 'Training target',
		name: NLL_EXAMPLE.trainingTargetToken,
		blurb: `log P = ${ NLL_EXAMPLE.logProb } · NLL = -log P = ${ NLL_EXAMPLE.nll }`,
		description: 'Lower NLL means the model assigns higher probability to the correct next token — exactly what training optimises for.',
	};

	let played = false;

	function playIntro() {

		played = true;
		tween( 1.1, ( t ) => {

			const eased = Easing.cubicOut( t );
			nllStick.scale.y = Math.max( 0.001, eased * ( NLL_EXAMPLE.nll / NLL_STICK_MAX ) );
			nllLabel.element.textContent = `NLL = ${ ( NLL_EXAMPLE.nll * eased ).toFixed( 2 ) }`;

		} );

	}

	return {
		scene,
		interactables: [ correctBar ],
		defaultView: {
			position: new THREE.Vector3( 0.4, 0.4, 5.0 ),
			target: new THREE.Vector3( 0.4, -0.6, 0 ),
		},
		reset() {

			played = false;
			nllStick.scale.y = 0.001;
			nllLabel.element.textContent = 'NLL = 0.00';
			playIntro();

		},
		update() {

			if ( ! played ) playIntro();

		},
	};

}
