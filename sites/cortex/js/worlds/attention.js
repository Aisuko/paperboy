import * as THREE from 'three';
import { TOKENS } from '../data/tokens.js';
import { ATTENTION_STEPS, MOCK_ATTENTION_MATRIX } from '../data/attentionSteps.js';
import { addStandardLighting, createStarfield, createFloor, createOrbNode, createHeatmapPlane, createLabel } from '../utils/sceneKit.js';
import { IPCLink } from '../utils/ipcLink.js';
import { tween } from '../utils/tween.js';

const SPACING = 1.1;
const Q_COLOR = 0x8b7bff;
const K_COLOR = 0x35d0ba;
const V_COLOR = 0xff5da2;
const TOKEN_Y = 2.2;
const HEATMAP_Y = 0.4;
const ZOUT_Y = -0.9;
const CONCAT_Y = -1.7;
const WO_Y = -2.4;

export function buildAttentionWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene, 0x35d0ba );
	scene.add( createStarfield() );
	scene.add( createFloor( 7, 0x0e1418 ) );

	const rig = new THREE.Group();
	scene.add( rig );

	const offset = ( ( TOKENS.length - 1 ) * SPACING ) / 2;
	const tokenNodes = [];
	const qkvLinks = [];
	const zOrbs = [];

	TOKENS.forEach( ( token, i ) => {

		const x = i * SPACING - offset;
		const chip = createOrbNode( { color: 0x8b7bff, radius: 0.16 } );
		chip.position.set( x, TOKEN_Y, 0 );
		const label = createLabel( token.text, 'label2d label2d-dim' );
		label.position.set( 0, 0.3, 0 );
		chip.add( label );
		rig.add( chip );
		tokenNodes.push( chip );

		const heatCenter = new THREE.Vector3( 0, HEATMAP_Y + 0.3, 0 );
		[ [ Q_COLOR, -0.18 ], [ K_COLOR, 0 ], [ V_COLOR, 0.18 ] ].forEach( ( [ color, dx ] ) => {

			const start = chip.position.clone(); start.x += dx;
			const link = new IPCLink( rig, start, heatCenter.clone(), color, { particleCount: 2, speed: 0.45, radius: 0.012, arc: 0.15, tubeOpacity: 0.12 } );
			qkvLinks.push( link );

		} );

		const zOrb = createOrbNode( { color: 0x35d0ba, radius: 0.14 } );
		zOrb.position.set( x, ZOUT_Y, 0 );
		zOrb.userData.detail = {
			category: 'Head output',
			name: `Z for "${ token.text }"`,
			blurb: 'Z_h = A_h V_h — the attention-weighted value vector for this token.',
			description: '',
		};
		rig.add( zOrb );
		zOrbs.push( zOrb );

	} );

	const heatmap = createHeatmapPlane( MOCK_ATTENTION_MATRIX, { cols: TOKENS.length, cellSize: 0.32, baseColor: new THREE.Color( 0x35d0ba ) } );
	heatmap.position.set( 0, HEATMAP_Y, 0 );
	heatmap.userData.detail = {
		category: 'Attention weights',
		name: 'A_h = softmax(Q_h K_h^T / sqrt(d_k))',
		blurb: 'Row i is how much token i attends to every token up to and including itself.',
		description: '',
	};
	rig.add( heatmap );
	const heatLabel = createLabel( 'A_h (causal)', 'label2d label2d-dim' );
	heatLabel.position.set( 0, 0.5, 0 );
	heatmap.add( heatLabel );

	const concatBar = new THREE.Mesh(
		new THREE.BoxGeometry( TOKENS.length * SPACING * 0.9, 0.18, 0.5 ),
		new THREE.MeshStandardMaterial( { color: 0xff5da2, emissive: 0xff5da2, emissiveIntensity: 0.5, transparent: true, opacity: 0.7, roughness: 0.4 } ),
	);
	concatBar.position.set( 0, CONCAT_Y, 0 );
	rig.add( concatBar );
	const concatLabel = createLabel( 'Z = Concat(Z_1 .. Z_H)', 'label2d label2d-dim' );
	concatLabel.position.set( 0, 0.3, 0 );
	concatBar.add( concatLabel );

	const woBeam = new THREE.Mesh(
		new THREE.CylinderGeometry( 0.05, 0.4, 0.5, 24 ),
		new THREE.MeshStandardMaterial( { color: 0x8b7bff, emissive: 0x8b7bff, emissiveIntensity: 0.6, transparent: true, opacity: 0.8, roughness: 0.35 } ),
	);
	woBeam.position.set( 0, WO_Y, 0 );
	rig.add( woBeam );
	const woLabel = createLabel( 'AttentionOutput = Z W^O', 'label2d label2d-dim' );
	woLabel.position.set( 0, -0.35, 0 );
	woBeam.add( woLabel );

	function fadeTo( objects, opacity, duration = 0.5 ) {

		objects.forEach( ( obj ) => {

			const mat = obj.material;
			const from = mat.opacity;
			tween( duration, ( t ) => { mat.opacity = THREE.MathUtils.lerp( from, opacity, t ); } );

		} );

	}

	function highlight( index ) {

		const showQkv = index === 0;
		const showHeat = index === 1 || index === 2;
		const showZ = index >= 2 && index <= 5;
		const showConcat = index >= 3;
		const showWO = index >= 4;

		qkvLinks.forEach( ( l ) => l.setActive( showQkv ) );
		heatmap.children.forEach( ( cell ) => { if ( cell.material ) fadeTo( [ cell ], showHeat ? 1 : 0.12, 0.4 ); } );
		zOrbs.forEach( ( orb ) => { orb.material.opacity = showZ ? 1 : 0.15; orb.visible = true; } );
		concatBar.material.opacity = showConcat ? 0.85 : 0.08;
		woBeam.material.opacity = showWO ? 0.9 : 0.08;

	}

	// zOrbs / concatBar / woBeam materials need transparent:true to fade.
	zOrbs.forEach( ( orb ) => { orb.material.transparent = true; } );
	heatmap.children.forEach( ( cell ) => { if ( cell.material ) cell.material.transparent = true; } );

	highlight( 0 );

	return {
		scene,
		interactables: [ heatmap, ...zOrbs ],
		totalSteps: ATTENTION_STEPS.length,
		defaultView: {
			position: new THREE.Vector3( 0, 1.0, 7.5 ),
			target: new THREE.Vector3( 0, -0.3, 0 ),
		},
		getStepView( index ) {

			const views = [
				{ position: new THREE.Vector3( 0, 2.0, 5.5 ), target: new THREE.Vector3( 0, 1.6, 0 ) },
				{ position: new THREE.Vector3( 0, 0.9, 4.2 ), target: new THREE.Vector3( 0, 0.4, 0 ) },
				{ position: new THREE.Vector3( 0, 0, 4.6 ), target: new THREE.Vector3( 0, -0.9, 0 ) },
				{ position: new THREE.Vector3( 0, -0.4, 4.6 ), target: new THREE.Vector3( 0, -1.7, 0 ) },
				{ position: new THREE.Vector3( 0, -0.8, 4.6 ), target: new THREE.Vector3( 0, -2.4, 0 ) },
				{ position: new THREE.Vector3( 0, 0.6, 7.5 ), target: new THREE.Vector3( 0, -0.3, 0 ) },
				{ position: new THREE.Vector3( 0, 1.0, 7.5 ), target: new THREE.Vector3( 0, -0.3, 0 ) },
			];
			return views[ Math.max( 0, Math.min( views.length - 1, index ) ) ];

		},
		goToStep( index ) {

			highlight( Math.max( 0, Math.min( ATTENTION_STEPS.length - 1, index ) ) );

		},
		update( dt ) {

			for ( const link of qkvLinks ) link.update( dt );

		},
	};

}
