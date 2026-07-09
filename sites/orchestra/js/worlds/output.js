import * as THREE from 'three';
import { addStandardLighting, createStarfield, createFloor, createGaugeRing, createBellCurveMesh, createBarMesh, createLabel } from '../utils/sceneKit.js';
import { tween, Easing } from '../utils/tween.js';

const FINAL = {
	soh: 94.2,
	rul: 312,
	risk: 28, // 0-100 gauge, "Low" band
	uncertainty: 2.1,
};

export function buildOutputWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene, 0x10b981 );
	scene.add( createStarfield() );
	scene.add( createFloor( 6.5, 0x0d1a16 ) );

	const rig = new THREE.Group();
	scene.add( rig );

	// SOH gauge.
	const sohGauge = createGaugeRing( { radius: 0.7, tube: 0.09, color: 0x3b82f6, fraction: FINAL.soh / 100 } );
	sohGauge.position.set( -1.7, 0.3, -1 );
	rig.add( sohGauge );
	const sohLabel = createLabel( 'SOH: 0%' );
	sohLabel.position.set( 0, 0.95, 0 );
	sohGauge.add( sohLabel );

	// RUL bar grows to a fixed reference height; scale.y animates 0 -> 1.
	const RUL_BAR_HEIGHT = 1.6;
	const rulBar = createBarMesh( { width: 0.4, depth: 0.4, height: RUL_BAR_HEIGHT, color: 0xa855f7 } );
	rulBar.scale.y = 0.001;
	rulBar.position.set( 1.7, -0.85, -1 );
	rig.add( rulBar );
	const rulLabel = createLabel( 'RUL: 0 cyc' );
	rulLabel.position.set( 0, RUL_BAR_HEIGHT + 0.2, 0 );
	rulBar.add( rulLabel );

	// Risk bar grows to a fraction of the same reference height (0-100 scale).
	const RISK_BAR_HEIGHT = 1.6;
	const riskBar = createBarMesh( { width: 0.4, depth: 0.4, height: RISK_BAR_HEIGHT, color: 0x10b981 } );
	riskBar.scale.y = 0.001;
	riskBar.position.set( -1.7, -0.85, 1 );
	rig.add( riskBar );
	const riskLabel = createLabel( 'Risk: —' );
	riskLabel.position.set( 0, RISK_BAR_HEIGHT + 0.2, 0 );
	riskBar.add( riskLabel );

	// Uncertainty bell curve.
	const uncMesh = createBellCurveMesh( { width: 1.6, depth: 0.7, sigma: 0.36, color: 0x06b6d4 } );
	uncMesh.position.set( 1.7, 0, 1 );
	uncMesh.scale.setScalar( 0.001 );
	rig.add( uncMesh );
	const uncLabel = createLabel( 'Uncertainty: ±0%' );
	uncLabel.position.set( 0, 0.9, 0 );
	uncMesh.add( uncLabel );

	const detailTarget = {
		category: 'Zone 04', name: 'Final Output',
		blurb: 'A single unified SOH, RUL, Risk and Uncertainty estimate, ready for downstream decisions.',
		description: 'Supports downstream decision-making and application allocation.',
	};
	[ sohGauge, rulBar, riskBar, uncMesh ].forEach( ( obj ) => { obj.userData.detail = detailTarget; } );

	let elapsed = 0;
	let played = false;

	function playIntro() {

		played = true;
		tween( 1.3, ( t ) => {

			const eased = Easing.cubicOut( t );
			sohLabel.element.textContent = `SOH: ${ ( FINAL.soh * eased ).toFixed( 1 ) }%`;
			uncLabel.element.textContent = `Uncertainty: ±${ ( FINAL.uncertainty * eased ).toFixed( 1 ) }%`;
			uncMesh.scale.setScalar( Math.max( 0.001, eased ) );

		} );
		tween( 1.3, ( t ) => {

			const eased = Easing.cubicOut( t );
			rulLabel.element.textContent = `RUL: ${ Math.round( FINAL.rul * eased ) } cyc`;
			rulBar.scale.y = Math.max( 0.001, eased );

		} );
		tween( 1.3, ( t ) => {

			const eased = Easing.cubicOut( t );
			riskLabel.element.textContent = eased > 0.85 ? 'Risk: Low' : `Risk: ${ Math.round( FINAL.risk * eased ) }%`;
			riskBar.scale.y = Math.max( 0.001, eased * ( FINAL.risk / 100 ) );

		} );

	}

	return {
		scene,
		interactables: [ sohGauge, rulBar, riskBar, uncMesh ],
		defaultView: {
			position: new THREE.Vector3( 0, 2.4, 4.6 ),
			target: new THREE.Vector3( 0, 0, 0 ),
		},
		reset() {

			played = false;
			sohLabel.element.textContent = 'SOH: 0%';
			rulLabel.element.textContent = 'RUL: 0 cyc';
			riskLabel.element.textContent = 'Risk: —';
			uncLabel.element.textContent = 'Uncertainty: ±0%';
			rulBar.scale.y = 0.001;
			riskBar.scale.y = 0.001;
			uncMesh.scale.setScalar( 0.001 );
			playIntro();

		},
		update( dt ) {

			elapsed += dt;
			if ( ! played ) playIntro();
			rig.rotation.y = Math.sin( elapsed * 0.15 ) * 0.08;

		},
	};

}
