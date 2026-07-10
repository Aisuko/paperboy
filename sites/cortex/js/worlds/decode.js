import * as THREE from 'three';
import { VOCAB, CORRECT_TOKEN_ID } from '../data/vocab.js';
import { addStandardLighting, createStarfield, createFloor, createBarMesh, createLabel, createOrbNode, createSoftmaxCurve, softmaxCurvePoint } from '../utils/sceneKit.js';
import { tween, Easing } from '../utils/tween.js';

const SPACING = 0.75;
const BAR_MAX_HEIGHT = 2.2;
const BASE_COLOR = 0x8b7bff;
const CORRECT_COLOR = 0x35d0ba;
const DIM_COLOR = 0x33324a;
const CURVE_BASE_Y = -1.1;

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

	// Softmax curve: an illustrative S-shaped squashing curve (see
	// createSoftmaxCurve) that each candidate's actual probability sits on
	// exactly, via softmaxCurvePoint — shown instead of the bars once
	// "Softmax" is selected.
	const curve = createSoftmaxCurve( { baseY: CURVE_BASE_Y, height: BAR_MAX_HEIGHT, color: BASE_COLOR } );
	curve.material.opacity = 0;
	rig.add( curve );

	const seenProb = new Map();
	const markers = VOCAB.map( ( entry ) => {

		const point = softmaxCurvePoint( curve, entry.prob );
		const dupeCount = seenProb.get( entry.prob ) || 0;
		seenProb.set( entry.prob, dupeCount + 1 );
		point.z += dupeCount * 0.22;

		const color = entry.id === CORRECT_TOKEN_ID ? CORRECT_COLOR : BASE_COLOR;
		const marker = createOrbNode( { color, radius: 0.09 } );
		marker.position.copy( point );
		marker.material.transparent = true;
		marker.material.opacity = 0;
		const markerHalo = marker.children.find( ( c ) => c.isMesh );
		markerHalo.material.opacity = 0;
		marker.userData.baseColor = color;
		marker.userData.detail = {
			category: 'Softmax probability',
			name: entry.token,
			blurb: `logit ${ entry.logit.toFixed( 2 ) } · softmax probability ${ entry.prob.toFixed( 2 ) }`,
			description: '',
		};
		rig.add( marker );

		const label = createLabel( `${ entry.token} ${ ( entry.prob * 100 ).toFixed( 1 ) }%`, 'label2d label2d-dim' );
		label.position.set( 0, 0.22, 0 );
		label.element.style.opacity = 0;
		marker.add( label );

		return { mesh: marker, entry };

	} );

	// y-axis guide (0.0-1.0) next to the curve, echoing the reference
	// softmax-function plot.
	const axisX = -( curve.userData.width / 2 ) - 0.5;
	const axisGeo = new THREE.BufferGeometry().setFromPoints( [
		new THREE.Vector3( axisX, CURVE_BASE_Y, 0 ),
		new THREE.Vector3( axisX, CURVE_BASE_Y + BAR_MAX_HEIGHT, 0 ),
	] );
	const axisMat = new THREE.LineBasicMaterial( { color: 0x5a5a72, transparent: true, opacity: 0 } );
	const axisLine = new THREE.Line( axisGeo, axisMat );
	rig.add( axisLine );

	const axisTicks = [ 0, 0.5, 1 ].map( ( v ) => {

		const label = createLabel( v.toFixed( 1 ), 'label2d label2d-dim' );
		label.position.set( axisX, CURVE_BASE_Y + v * BAR_MAX_HEIGHT, 0 );
		label.element.style.opacity = 0;
		rig.add( label );
		return label;

	} );

	let stage = 0; // 0 = logits, 1 = softmax

	function showStage( index ) {

		stage = index;
		const showCurve = stage === 1;

		bars.forEach( ( { mesh, entry } ) => {

			const targetFrac = ( stage === 0 ? logitHeight( entry.logit ) : probHeight( entry.prob ) ) / BAR_MAX_HEIGHT;
			tween( 0.6, ( t ) => {

				mesh.scale.y = THREE.MathUtils.lerp( mesh.scale.y, targetFrac, t );

			}, { easing: Easing.cubicOut } );

			const barLabel = mesh.children.find( ( c ) => c.isCSS2DObject );
			const fromOpacity = mesh.material.opacity ?? 1;
			const toOpacity = showCurve ? 0 : 1;
			mesh.material.transparent = true;
			tween( 0.5, ( t ) => {

				mesh.material.opacity = THREE.MathUtils.lerp( fromOpacity, toOpacity, t );
				if ( barLabel ) barLabel.element.style.opacity = THREE.MathUtils.lerp( fromOpacity, toOpacity, t );

			}, { easing: Easing.cubicOut } );

		} );

		const fromCurve = curve.material.opacity;
		const toCurve = showCurve ? 1 : 0;
		tween( 0.5, ( t ) => { curve.material.opacity = THREE.MathUtils.lerp( fromCurve, toCurve, t ); }, { easing: Easing.cubicOut } );

		markers.forEach( ( { mesh } ) => {

			const halo = mesh.children.find( ( c ) => c.isMesh );
			const label = mesh.children.find( ( c ) => c.isCSS2DObject );
			const from = mesh.material.opacity;
			const to = showCurve ? 1 : 0;
			const fromHalo = halo.material.opacity;
			const toHalo = showCurve ? 0.14 : 0;
			tween( 0.5, ( t ) => {

				mesh.material.opacity = THREE.MathUtils.lerp( from, to, t );
				halo.material.opacity = THREE.MathUtils.lerp( fromHalo, toHalo, t );
				if ( label ) label.element.style.opacity = THREE.MathUtils.lerp( from, to, t );

			}, { easing: Easing.cubicOut } );

		} );

		const fromAxis = axisLine.material.opacity;
		const toAxis = showCurve ? 0.5 : 0;
		tween( 0.5, ( t ) => { axisLine.material.opacity = THREE.MathUtils.lerp( fromAxis, toAxis, t ); } );
		axisTicks.forEach( ( label ) => { label.element.style.opacity = showCurve ? 0.6 : 0; } );

	}

	function highlightSampling( pickIds ) {

		bars.forEach( ( { mesh, entry } ) => {

			const picked = ! pickIds || pickIds.includes( entry.id );
			const color = picked ? mesh.userData.baseColor : DIM_COLOR;
			mesh.material.color.setHex( color );
			mesh.material.emissive.setHex( color );
			mesh.material.emissiveIntensity = picked ? 0.6 : 0.15;

		} );

		markers.forEach( ( { mesh, entry } ) => {

			const picked = ! pickIds || pickIds.includes( entry.id );
			const color = picked ? mesh.userData.baseColor : DIM_COLOR;
			mesh.material.color.setHex( color );
			mesh.material.emissive.setHex( color );
			mesh.material.emissiveIntensity = picked ? 1.2 : 0.3;

		} );

	}

	return {
		scene,
		interactables: [ ...bars.map( ( b ) => b.mesh ), ...markers.map( ( m ) => m.mesh ) ],
		defaultView: {
			position: new THREE.Vector3( 0, 0.4, 5.2 ),
			target: new THREE.Vector3( 0, -0.6, 0 ),
		},
		showStage,
		highlightSampling,
		update() {},
	};

}
