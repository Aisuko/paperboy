import * as THREE from 'three';
import { TOKENS } from '../data/tokens.js';
import { ATTENTION_STEPS, MOCK_ATTENTION_MATRIX, HEAD_COUNT, HEAD_MATRICES, HEAD_STRENGTH } from '../data/attentionSteps.js';
import { addStandardLighting, createDeck, createOrbNode, createHeatmapPlane, setHeatmapValues, createLabel, THEME } from '../utils/sceneKit.js';
import { RibbonLink, createRibbon } from '../utils/ribbon.js';
import { createStageModule } from '../utils/blockModules.js';
import { tween, Easing } from '../utils/tween.js';

const SPACING = 1.1;
const Q_COLOR = THEME.info;
const K_COLOR = THEME.accent;
const V_COLOR = THEME.signal;
const TOKEN_Y = 2.2;
const HEATMAP_Y = 0.4;
const ZOUT_Y = -0.9;
const CONCAT_Y = -1.7;
const WO_Y = -2.4;

const SPLIT_COLOR = new THREE.Color( THEME.accent );
const MERGED_COLOR = new THREE.Color( THEME.info );

const MINI_TYPES = [ 'layernorm', 'self-attention', 'residual-add', 'mlp' ];
const MINI_COLORS = [ THEME.accent, THEME.info, THEME.signal, THEME.violet ];

function miniConnector( from, to, color ) {

	const mid = from.clone().lerp( to, 0.5 );
	mid.y += 0.3;
	const curve = new THREE.CatmullRomCurve3( [ from.clone(), mid, to.clone() ] );
	const geo = new THREE.TubeGeometry( curve, 16, 0.025, 6, false );
	const mat = new THREE.MeshBasicMaterial( { color, transparent: true, opacity: 0.5 } );
	return new THREE.Mesh( geo, mat );

}

export function buildAttentionWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene );
	scene.add( createDeck( 28, { y: -3.6, divisions: 56 } ) );

	const rig = new THREE.Group();
	scene.add( rig );

	const offset = ( ( TOKENS.length - 1 ) * SPACING ) / 2;
	const tokenNodes = [];
	const ribbonLinks = [];
	const ghostRibbons = [];
	const zOrbs = [];

	TOKENS.forEach( ( token, i ) => {

		const x = i * SPACING - offset;
		const chip = createOrbNode( { color: THEME.info, radius: 0.16 } );
		chip.position.set( x, TOKEN_Y, 0 );
		const label = createLabel( token.display, 'label2d label2d-key' );
		label.position.set( 0, 0.3, 0 );
		chip.add( label );
		rig.add( chip );
		tokenNodes.push( chip );

		const heatCenter = new THREE.Vector3( 0, HEATMAP_Y + 0.3, 0 );
		[ [ Q_COLOR, -0.18, 'q' ], [ K_COLOR, 0, 'k' ], [ V_COLOR, 0.18, 'v' ] ].forEach( ( [ color, dx, kind ] ) => {

			const start = chip.position.clone(); start.x += dx;
			const link = new RibbonLink( rig, start, heatCenter.clone(), color, {
				startWidth: 0.05, endWidth: 0.12, arc: 0.9, opacity: 0.45, particleCount: 1, speed: 0.45, radius: 0.012,
			} );
			link.tokenIndex = i;
			link.kind = kind;
			ribbonLinks.push( link );

			const ghostStart = start.clone();
			const ghostEnd = heatCenter.clone(); ghostEnd.z -= 0.22;
			ghostStart.z -= 0.22;
			const ghost = createRibbon( ghostStart, ghostEnd, { color, startWidth: 0.045, endWidth: 0.1, arc: 1.25, opacity: 0.08 } );
			rig.add( ghost );
			ghostRibbons.push( ghost );

		} );

		const zOrb = createOrbNode( { color: THEME.accent, radius: 0.14 } );
		zOrb.position.set( x, ZOUT_Y, 0 );
		zOrb.userData.baseX = x;
		zOrb.userData.jitter = ( i % 2 === 0 ? 1 : -1 ) * 0.06;
		zOrb.userData.detail = {
			category: 'Head output',
			name: `Z for "${ token.text }"`,
			blurb: 'Z_h = A_h V_h — the attention-weighted value vector for this token.',
			description: '',
		};
		rig.add( zOrb );
		zOrbs.push( zOrb );

	} );

	const heatmap = createHeatmapPlane( MOCK_ATTENTION_MATRIX, { cols: TOKENS.length, cellSize: 0.32, baseColor: new THREE.Color( THEME.accent ) } );
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

	const aggregateMatrix = MOCK_ATTENTION_MATRIX.map( ( _, i ) => {

		const sum = HEAD_MATRICES.reduce( ( acc, m ) => acc + m[ i ], 0 );
		return sum / HEAD_MATRICES.length;

	} );
	const ghostHeatmap = createHeatmapPlane( aggregateMatrix, { cols: TOKENS.length, cellSize: 0.32, baseColor: new THREE.Color( THEME.accent ) } );
	ghostHeatmap.position.set( 0, HEATMAP_Y, -0.22 );
	ghostHeatmap.children.forEach( ( cell ) => { cell.material.transparent = true; cell.material.opacity = 0.08; } );
	rig.add( ghostHeatmap );

	const concatBar = new THREE.Mesh(
		new THREE.BoxGeometry( TOKENS.length * SPACING * 0.9, 0.18, 0.5 ),
		new THREE.MeshStandardMaterial( { color: THEME.signal, emissive: THEME.signal, emissiveIntensity: 0.5, transparent: true, opacity: 0.7, roughness: 0.4 } ),
	);
	concatBar.position.set( 0, CONCAT_Y, 0 );
	rig.add( concatBar );
	const concatLabel = createLabel( 'Z = Concat(Z_1 .. Z_H)', 'label2d label2d-dim' );
	concatLabel.position.set( 0, 0.3, 0 );
	concatBar.add( concatLabel );

	const woBeam = new THREE.Mesh(
		new THREE.CylinderGeometry( 0.05, 0.4, 0.5, 24 ),
		new THREE.MeshStandardMaterial( { color: THEME.info, emissive: THEME.info, emissiveIntensity: 0.6, transparent: true, opacity: 0.8, roughness: 0.35 } ),
	);
	woBeam.position.set( 0, WO_Y, 0 );
	rig.add( woBeam );
	const woLabel = createLabel( 'AttentionOutput = Z W^O', 'label2d label2d-dim' );
	woLabel.position.set( 0, -0.35, 0 );
	woBeam.add( woLabel );

	// Step 6 payoff: a small recap ladder (reusing the same module builder as
	// the 02 Block page) showing where this attention output feeds into the
	// rest of the decoder block, connected from woBeam.
	const ladderGroup = new THREE.Group();
	const ladderPos = new THREE.Vector3( 2.6, WO_Y - 0.2, 0 );
	ladderGroup.position.copy( ladderPos );
	const miniLinks = [];
	MINI_TYPES.forEach( ( type, i ) => {

		const m = createStageModule( type, { scale: 0.34, color: MINI_COLORS[ i ], accentColor: MINI_COLORS[ ( i + 1 ) % MINI_COLORS.length ] } );
		m.position.set( 0, -i * 0.34, 0 );
		ladderGroup.add( m );
		miniLinks.push( ...m.userData.links );

	} );
	rig.add( ladderGroup );

	const connector = miniConnector( new THREE.Vector3( 0, WO_Y, 0 ), ladderPos, THEME.info );
	rig.add( connector );

	ladderGroup.visible = false;
	connector.visible = false;
	let ladderRevealed = false;

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
		const showZ = index >= 2 && index <= 6;
		const showConcat = index >= 3;
		const showWO = index >= 4;
		const showLadder = index === 5 || index === 6;

		ribbonLinks.forEach( ( l ) => l.setActive( showQkv ) );
		ghostRibbons.forEach( ( m ) => fadeTo( [ m ], showQkv ? 0.1 : 0.02, 0.4 ) );
		heatmap.children.forEach( ( cell ) => { if ( cell.material ) fadeTo( [ cell ], showHeat ? 1 : 0.12, 0.4 ); } );
		ghostHeatmap.children.forEach( ( cell ) => { if ( cell.material ) fadeTo( [ cell ], showHeat ? 0.1 : 0.02, 0.4 ); } );
		zOrbs.forEach( ( orb ) => { orb.material.opacity = showZ ? 1 : 0.15; orb.visible = true; } );
		concatBar.material.opacity = showConcat ? 0.85 : 0.08;
		woBeam.material.opacity = showWO ? 0.9 : 0.08;

		if ( showLadder && ! ladderRevealed ) {

			ladderGroup.scale.setScalar( 0.6 );
			tween( 0.5, ( t ) => { ladderGroup.scale.setScalar( THREE.MathUtils.lerp( 0.6, 1, t ) ); }, { easing: Easing.backOut } );

		}
		ladderRevealed = showLadder;
		ladderGroup.visible = showLadder;
		connector.visible = showLadder;

	}

	// zOrbs / concatBar / woBeam materials need transparent:true to fade.
	zOrbs.forEach( ( orb ) => { orb.material.transparent = true; } );
	heatmap.children.forEach( ( cell ) => { if ( cell.material ) cell.material.transparent = true; } );

	let activeHead = 0;
	let currentStep = 0;
	let woLoopElapsed = 0;

	// Naive-recompute vs KV-cache toggle: K/V ribbons belong to a token index
	// via link.tokenIndex/link.kind (tagged where ribbonLinks are built above).
	// In "cache" mode every earlier token's K/V is treated as already computed
	// (dim + static); only the newest token still lights up — in "naive" mode
	// every token's K/V re-pulses together, illustrating the O(n) work redone
	// per generation step that a KV cache avoids.
	let computeMode = 'naive';
	let kvPulseElapsed = 0;
	const lastTokenIndex = TOKENS.length - 1;
	const kvLinks = ribbonLinks.filter( ( link ) => link.kind === 'k' || link.kind === 'v' );

	function applyComputeMode() {

		kvLinks.forEach( ( link ) => {

			const isNewest = link.tokenIndex === lastTokenIndex;
			link.setActive( computeMode === 'naive' || isNewest );

		} );

	}

	function resetWOLoop() {

		zOrbs.forEach( ( orb ) => {

			orb.position.x = orb.userData.baseX;
			orb.material.color.copy( SPLIT_COLOR );
			orb.material.emissive.copy( SPLIT_COLOR );

		} );
		woLoopElapsed = 0;

	}

	highlight( 0 );
	applyComputeMode();

	return {
		scene,
		interactables: [ heatmap, ...zOrbs ],
		totalSteps: ATTENTION_STEPS.length,
		defaultView: {
			position: new THREE.Vector3( 0.6, 1.8, 14.0 ),
			target: new THREE.Vector3( 0.6, -0.3, 0 ),
		},
		getStepView( index ) {

			const views = [
				{ position: new THREE.Vector3( 0.6, 2.9, 9.8 ), target: new THREE.Vector3( 0.6, 1.6, 0 ) },
				{ position: new THREE.Vector3( 0.6, 1.5, 8.0 ), target: new THREE.Vector3( 0.6, 0.4, 0 ) },
				{ position: new THREE.Vector3( 0.6, 0.3, 8.4 ), target: new THREE.Vector3( 0.6, -0.9, 0 ) },
				{ position: new THREE.Vector3( 0.6, -0.4, 8.4 ), target: new THREE.Vector3( 0.6, -1.7, 0 ) },
				{ position: new THREE.Vector3( 0.6, -1.0, 8.4 ), target: new THREE.Vector3( 0.6, -2.4, 0 ) },
				{ position: new THREE.Vector3( 2.0, -1.2, 11.0 ), target: new THREE.Vector3( 2.0, -2.7, 0 ) },
				{ position: new THREE.Vector3( 2.6, -2.2, 8.6 ), target: new THREE.Vector3( 2.6, -3.1, 0 ) },
			];
			return views[ Math.max( 0, Math.min( views.length - 1, index ) ) ];

		},
		goToStep( index ) {

			resetWOLoop();
			currentStep = Math.max( 0, Math.min( ATTENTION_STEPS.length - 1, index ) );
			highlight( currentStep );
			applyComputeMode();

		},
		setComputeMode( mode ) {

			computeMode = mode === 'cache' ? 'cache' : 'naive';
			applyComputeMode();

		},
		setHead( headIndex ) {

			activeHead = THREE.MathUtils.clamp( headIndex, 0, HEAD_COUNT - 1 );
			setHeatmapValues( heatmap, HEAD_MATRICES[ activeHead ] );
			const strength = HEAD_STRENGTH[ activeHead ];
			ribbonLinks.forEach( ( link ) => {

				const mat = link.mesh.material;
				const from = mat.emissiveIntensity;
				const to = 0.5 * strength;
				tween( 0.5, ( t ) => { mat.emissiveIntensity = THREE.MathUtils.lerp( from, to, t ); }, { easing: Easing.cubicInOut } );

			} );

		},
		update( dt ) {

			for ( const link of ribbonLinks ) link.update( dt );
			for ( const link of miniLinks ) link.update( dt );

			if ( currentStep === 0 || currentStep === 1 ) {

				kvPulseElapsed += dt;
				const pulse = 0.5 + 0.5 * Math.sin( kvPulseElapsed * Math.PI * 1.6 );
				kvLinks.forEach( ( link ) => {

					const isNewest = link.tokenIndex === lastTokenIndex;
					if ( computeMode === 'naive' || isNewest ) link.mesh.material.emissiveIntensity = THREE.MathUtils.lerp( 0.3, 0.9, pulse );

				} );

			}

			if ( currentStep === 6 ) {

				woLoopElapsed += dt;
				const t = ( Math.sin( woLoopElapsed * Math.PI * 0.5 ) + 1 ) / 2;
				zOrbs.forEach( ( orb ) => {

					orb.material.color.copy( SPLIT_COLOR ).lerp( MERGED_COLOR, t );
					orb.material.emissive.copy( orb.material.color );
					orb.position.x = orb.userData.baseX + ( 1 - t ) * orb.userData.jitter;

				} );
				woBeam.material.opacity = THREE.MathUtils.lerp( 0.15, 0.9, t );

			}

		},
	};

}
