import * as THREE from 'three';
import { CANDIDATES, TARGET_ID, decode } from '../data/vocab.js';
import { addStandardLighting, createDeck, createBarMesh, createLabel, THEME } from '../utils/sceneKit.js';
import { tween, Easing } from '../utils/tween.js';

// 05 · Train vs infer. Same distribution as 04 Output, read the other way
// round: at inference you sample from it, at training you only care what
// probability it gave the token that actually came next.
//
// The loss stick's height is the live NLL from data/vocab.js, so moving the
// temperature on 04 moves this too — which is the point, since temperature is
// an inference-time knob that has no business being in the loss.

const SPACING = 0.92;
const PROB_BAR_MAX = 2.4;
const NLL_STICK_MAX = 3.0;
const NLL_FULL_SCALE = 4.0; // NLL value that fills the stick

export function buildTrainWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene, THEME.signal );
	scene.add( createDeck( 24, { y: -1.6, divisions: 48 } ) );

	const rig = new THREE.Group();
	scene.add( rig );

	const offset = ( ( CANDIDATES.length - 1 ) * SPACING ) / 2;
	const bars = [];
	let targetBar = null;

	CANDIDATES.forEach( ( candidate, i ) => {

		const isTarget = candidate.id === TARGET_ID;
		const color = isTarget ? THEME.signal : THEME.muted;
		const bar = createBarMesh( { width: 0.5, depth: 0.5, height: PROB_BAR_MAX, color } );
		bar.position.set( i * SPACING - offset, -1.1, 0 );
		bar.scale.y = 0.001;
		bar.material.emissiveIntensity = isTarget ? 0.7 : 0.15;
		rig.add( bar );

		const name = createLabel( candidate.display, isTarget ? 'label2d label2d-key' : 'label2d label2d-dim' );
		name.position.set( 0, -0.3, 0 );
		bar.add( name );

		const value = createLabel( '', 'label2d label2d-dim' );
		value.position.set( 0, PROB_BAR_MAX + 0.3, 0 );
		bar.add( value );

		bars.push( { mesh: bar, value, candidate, isTarget } );
		if ( isTarget ) targetBar = bar;

	} );

	// The loss stick: how far the correct token's probability is from 1.
	const nllStick = createBarMesh( { width: 0.2, depth: 0.2, height: NLL_STICK_MAX, color: THEME.accent } );
	nllStick.scale.y = 0.001;
	nllStick.position.set( targetBar.position.x + 0.72, -1.1, 0 );
	rig.add( nllStick );

	const nllLabel = createLabel( 'NLL 0.00', 'label2d label2d-key' );
	nllLabel.position.set( 0, NLL_STICK_MAX + 0.3, 0 );
	nllStick.add( nllLabel );

	const targetLabel = createLabel( `training target: "${ CANDIDATES.find( ( c ) => c.id === TARGET_ID ).token }"`, 'label2d label2d-dim' );
	targetLabel.position.set( targetBar.position.x, -1.75, 0 );
	rig.add( targetLabel );

	let current = decode();

	function apply( result, { animate = true } = {} ) {

		current = result;

		result.rows.forEach( ( row, i ) => {

			const entry = bars[ i ];
			const target = Math.max( 0.004, row.prob );
			const from = entry.mesh.scale.y;
			tween( animate ? 0.55 : 0.001, ( t ) => {

				entry.mesh.scale.y = THREE.MathUtils.lerp( from, target, t );

			}, { easing: Easing.cubicOut } );
			entry.value.element.textContent = `${ ( row.prob * 100 ).toFixed( 1 ) }%`;

		} );

		const stickTarget = Math.max( 0.004, Math.min( 1, result.nll / NLL_FULL_SCALE ) );
		const stickFrom = nllStick.scale.y;
		tween( animate ? 0.7 : 0.001, ( t ) => {

			nllStick.scale.y = THREE.MathUtils.lerp( stickFrom, stickTarget, t );
			nllLabel.element.textContent = `NLL ${ ( result.nll * ( animate ? t : 1 ) ).toFixed( 3 ) }`;

		}, { easing: Easing.cubicOut, onComplete: () => {

			nllLabel.element.textContent = `NLL ${ result.nll.toFixed( 3 ) }`;

		} } );

		targetBar.userData.detail = {
			category: 'Training target',
			name: `"${ CANDIDATES.find( ( c ) => c.id === TARGET_ID ).token }"  (id ${ TARGET_ID })`,
			blurb: `P = ${ result.targetProb.toFixed( 4 ) } · log P = ${ Math.log( result.targetProb ).toFixed( 3 ) } · NLL = ${ result.nll.toFixed( 3 ) }`,
			description: 'Training never samples. It reads off the probability the model gave the token that actually came next and takes its negative log. Lower is better; zero would mean total certainty in the right answer.',
			metric: result.nll.toFixed( 3 ),
			metricLabel: 'Cross-entropy loss (nats)',
		};

	}

	apply( current, { animate: false } );

	return {
		scene,
		interactables: [ targetBar, ...bars.map( ( b ) => b.mesh ) ],
		defaultView: {
			position: new THREE.Vector3( -0.4, 2.8, 14.6 ),
			target: new THREE.Vector3( -0.4, 0.35, 0 ),
		},
		setResult( result ) { apply( result ); },
		reset() { apply( decode(), { animate: true } ); },
		getResult() { return current; },
		update() {},
	};

}
