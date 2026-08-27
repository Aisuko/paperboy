import * as THREE from 'three';
import { assess } from '../data/council.js';
import { addStandardLighting, createDeck, createGaugeRing, createBellCurveMesh, createBarMesh, createLabel, THEME } from '../utils/sceneKit.js';
import { tween, Easing } from '../utils/tween.js';

// 05 · What comes out. Four readouts, all computed by data/council.js from the
// same six agent votes: state of health, remaining useful life, the derived
// risk band, and the combined uncertainty the aggregation produced.

const RUL_HORIZON = 400; // cycles the RUL bar is drawn against
const BAR_HEIGHT = 1.7;

export function buildOutputWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene );
	scene.add( createDeck( 26, { y: -2.0, divisions: 52 } ) );

	const rig = new THREE.Group();
	scene.add( rig );

	const result = assess();

	// ---- SOH gauge ----
	const sohGauge = createGaugeRing( { radius: 0.62, tube: 0.085, color: THEME.info, fraction: result.soh.value / 100 } );
	sohGauge.position.set( -2.4, 0.5, -1.4 );
	rig.add( sohGauge );
	const sohLabel = createLabel( 'SOH 0.00%', 'label2d label2d-key' );
	sohLabel.position.set( 0, 0.92, 0 );
	sohGauge.add( sohLabel );
	const sohSigma = createLabel( `± ${ result.soh.sigma.toFixed( 2 ) }%`, 'label2d label2d-dim' );
	sohSigma.position.set( 0, -1.12, 0 );
	sohGauge.add( sohSigma );

	// ---- RUL bar ----
	const rulBar = createBarMesh( { width: 0.42, depth: 0.42, height: BAR_HEIGHT, color: THEME.violet } );
	rulBar.scale.y = 0.001;
	rulBar.position.set( 2.4, -1.0, -1.4 );
	rig.add( rulBar );
	const rulLabel = createLabel( 'RUL 0 cyc', 'label2d label2d-key' );
	rulLabel.position.set( 0, BAR_HEIGHT + 0.24, 0 );
	rulBar.add( rulLabel );
	const rulScale = createLabel( `of a ${ RUL_HORIZON }-cycle horizon`, 'label2d label2d-dim' );
	rulScale.position.set( 0, -0.28, 0 );
	rulBar.add( rulScale );

	// ---- risk meter ----
	const riskBar = createBarMesh( { width: 0.42, depth: 0.42, height: BAR_HEIGHT, color: result.risk.color } );
	riskBar.scale.y = 0.001;
	riskBar.position.set( -2.4, -1.0, 1.6 );
	rig.add( riskBar );
	const riskLabel = createLabel( 'Risk —', 'label2d label2d-key' );
	riskLabel.position.set( 0, BAR_HEIGHT + 0.24, 0 );
	riskBar.add( riskLabel );

	// ---- uncertainty distribution ----
	const uncMesh = createBellCurveMesh( { width: 1.7, depth: 0.7, sigma: 0.34, color: THEME.accent } );
	uncMesh.position.set( 2.4, 0.15, 1.6 );
	uncMesh.scale.setScalar( 0.001 );
	rig.add( uncMesh );
	const uncLabel = createLabel( 'σ ± 0.00%', 'label2d label2d-key' );
	uncLabel.position.set( 0, 0.85, 0 );
	uncMesh.add( uncLabel );

	const detail = {
		category: 'Zone 04',
		name: 'Final output',
		blurb: `SOH ${ result.soh.value.toFixed( 2 ) } ± ${ result.soh.sigma.toFixed( 2 ) }%  ·  RUL ${ Math.round( result.rul.value ) } ± ${ Math.round( result.rul.sigma ) } cyc  ·  risk ${ result.risk.label }`,
		description: 'Four numbers, all derived from the same six agent votes by inverse-variance weighting. Nothing here is a separate model — the risk band and the uncertainty fall out of the consensus rather than being estimated alongside it.',
	};
	[ sohGauge, rulBar, riskBar, uncMesh ].forEach( ( obj ) => { obj.userData.detail = detail; } );

	let elapsed = 0;
	let played = false;

	function playIntro() {

		played = true;

		tween( 1.2, ( t ) => {

			const e = Easing.cubicOut( t );
			sohLabel.element.textContent = `SOH ${ ( result.soh.value * e ).toFixed( 2 ) }%`;
			uncLabel.element.textContent = `σ ± ${ ( result.soh.sigma * e ).toFixed( 2 ) }%`;
			uncMesh.scale.setScalar( Math.max( 0.001, e ) );

		} );

		tween( 1.2, ( t ) => {

			const e = Easing.cubicOut( t );
			rulLabel.element.textContent = `RUL ${ Math.round( result.rul.value * e ) } cyc`;
			rulBar.scale.y = Math.max( 0.001, e * ( result.rul.value / RUL_HORIZON ) );

		} );

		tween( 1.2, ( t ) => {

			const e = Easing.cubicOut( t );
			riskLabel.element.textContent = e > 0.9
				? `Risk ${ result.risk.label } · ${ result.risk.index.toFixed( 0 ) }/100`
				: `Risk ${ ( result.risk.index * e ).toFixed( 0 ) }/100`;
			riskBar.scale.y = Math.max( 0.001, e * ( result.risk.index / 100 ) );

		} );

	}

	return {
		scene,
		interactables: [ sohGauge, rulBar, riskBar, uncMesh ],
		result,
		defaultView: {
			position: new THREE.Vector3( -0.4, 4.4, 15.4 ),
			target: new THREE.Vector3( -0.4, -0.15, 0 ),
		},
		reset() {

			played = false;
			sohLabel.element.textContent = 'SOH 0.00%';
			rulLabel.element.textContent = 'RUL 0 cyc';
			riskLabel.element.textContent = 'Risk —';
			uncLabel.element.textContent = 'σ ± 0.00%';
			rulBar.scale.y = 0.001;
			riskBar.scale.y = 0.001;
			uncMesh.scale.setScalar( 0.001 );
			playIntro();

		},
		update( dt ) {

			elapsed += dt;
			if ( ! played ) playIntro();
			rig.rotation.y = Math.sin( elapsed * 0.12 ) * 0.05;

		},
	};

}
