import * as THREE from 'three';
import { TOKENS } from '../data/tokens.js';
import { GPT2 } from '../data/gpt2.js';
import { ATTENTION_STEPS, MOCK_ATTENTION_MATRIX, HEAD_COUNT, HEAD_MATRICES } from '../data/attentionSteps.js';
import { addStandardLighting, createDeck, createLabel, THEME } from '../utils/sceneKit.js';
import {
	seeded, createMatrixPanel, createWeightWall, addPanelFrame, labelPanel, labelPanelRows,
	panelCell, setPanelValues, createMaskCap, createAddNode, createOpPlate, Conduit, setGroupState,
	boundsOf, fitView,
} from '../utils/tensorKit.js';
import { tween, Easing } from '../utils/tween.js';

// 03 · Multi-head self-attention, one station per step.
//
// Every station is the tensor the step produces, at the shape the step
// produces it:
//
//   0  x → q, k, v      three [5 × 64] slices out of one [768 × 2304] wall
//   1  S = qkᵀ/√d_k     a [5 × 5] score matrix, then the −inf lid, then softmax
//   2  Z = A·V          [5 × 5] × [5 × 64] → [5 × 64]
//   3  concat           12 head slices laid end to end → [5 × 768]
//   4  W^O              [768 × 768], the only place the heads mix
//   5  ⊕                attn_out added back into the residual stream
//   6  cost             the causal triangle counted

const SEQ = TOKENS.length;
const DK = 4; // of 64 drawn per head slice
const DIMS = 12; // of 768 drawn per full-width panel

const X_Y = 6.4;
const W_Y = 3.6;
const QKV_Y = 1.0;
const SCORE_Y = -1.9;
const Z_Y = -4.8;
const CONCAT_Y = -7.4;
const WO_Y = -10.0;
const ADD_Y = -12.8;

const Q_X = -5.6, K_X = 0, V_X = 5.6;
const S_X = -3.4, A_X = 3.4;

const HEAD_TINT = [ THEME.info, THEME.accent, THEME.signal ];

// Pre-softmax scores that are consistent with the head's post-softmax row:
// log p differs from the real score by a per-row constant, which is exactly
// what softmax throws away — so this is the honest inverse, not decoration.
function scoresFor( matrix ) {

	const out = new Array( SEQ * SEQ ).fill( 0 );
	for ( let r = 0; r < SEQ; r ++ ) {

		for ( let c = 0; c < SEQ; c ++ ) {

			const p = matrix[ r * SEQ + c ];
			out[ r * SEQ + c ] = c > r ? -1 : Math.max( -1, Math.log( Math.max( p, 1e-6 ) ) / 2.2 + 0.7 );

		}

	}
	return out;

}

export function buildAttentionWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene );
	scene.add( createDeck( 46, { y: -17.0, divisions: 92 } ) );

	const rig = new THREE.Group();
	scene.add( rig );

	const conduits = [];
	const interactables = [];

	// Conduits live in the wiring group of the station they feed, so stepping
	// away from a station takes its plumbing off screen with it.
	const wiring = ATTENTION_STEPS.map( () => {

		const group = new THREE.Group();
		rig.add( group );
		return group;

	} );

	function link( station, from, to, color, opts = {} ) {

		const c = new Conduit( wiring[ station ], [ from, from.clone().lerp( to, 0.5 ), to ], color, { particleCount: 1, speed: 0.45, ...opts } );
		conduits.push( c );
		return c;

	}

	function caption( text, x, y, className = 'label2d label2d-key' ) {

		const label = createLabel( text, className );
		label.position.set( x, y, 0 );
		rig.add( label );
		return label;

	}

	/* ------------------------------------------------------ 0 · q, k, v -- */

	const xPanel = createMatrixPanel( { rows: SEQ, cols: DIMS, color: THEME.ink, seed: 9 } );
	xPanel.position.set( 0, X_Y, 0 );
	rig.add( xPanel );
	addPanelFrame( xPanel, { color: THEME.ink, opacity: 0.3 } );
	labelPanel( xPanel, 'x̂ — block input after ln_1', `[1, ${ SEQ }, ${ GPT2.dModel }]` );
	labelPanelRows( xPanel, TOKENS.map( ( t ) => t.display ) );

	xPanel.userData.detail = {
		category: 'Activation',
		name: 'x̂ = ln_1(x)',
		blurb: 'One row per token, 768 features wide.',
		description: 'Self-attention never sees the raw text — only this tensor. Each of the twelve heads gets its own three projections of it.',
		metric: `[1, ${ SEQ }, ${ GPT2.dModel }]`,
		metricLabel: 'Tensor shape',
	};
	interactables.push( xPanel );

	const projections = [];
	const qkvPanels = [];

	[ [ 'W^Q', 'q', Q_X ], [ 'W^K', 'k', K_X ], [ 'W^V', 'v', V_X ] ].forEach( ( [ wName, name, x ], i ) => {

		const tint = HEAD_TINT[ i ];

		const wall = createWeightWall( { rows: 10, cols: 6, color: THEME.violet, seed: 11 + i * 29 } );
		wall.position.set( x, W_Y, 0 );
		rig.add( wall );
		labelPanel( wall, wName, `[${ GPT2.dModel } × ${ GPT2.dHead }]` );
		projections.push( wall );

		wall.userData.detail = {
			category: 'Weight',
			name: `${ wName }_h`,
			blurb: `Projects 768 model dimensions down to ${ GPT2.dHead } head dimensions.`,
			description: `GPT-2 stores all thirty-six of these (${ GPT2.nHead } heads × 3) as one fused [${ GPT2.dModel } × ${ 3 * GPT2.dModel }] weight called c_attn, then splits the result. Drawn separately here because the three do three different jobs.`,
			metric: `[${ GPT2.dModel } × ${ GPT2.dHead }]`,
			metricLabel: 'Weight shape',
		};
		interactables.push( wall );

		const panel = createMatrixPanel( { rows: SEQ, cols: DK, color: tint, seed: 120 + i * 41, cell: 0.24 } );
		panel.position.set( x, QKV_Y, 0 );
		rig.add( panel );
		addPanelFrame( panel, { color: tint, opacity: 0.32 } );
		labelPanel( panel, name, `[${ SEQ }, ${ GPT2.dHead }] per head` );
		labelPanelRows( panel, TOKENS.map( ( t ) => t.display ) );
		qkvPanels.push( panel );

		panel.userData.detail = {
			category: 'Activation',
			name: `${ name } — ${ [ 'query', 'key', 'value' ][ i ] }`,
			blurb: [ 'What am I looking for?', 'What do I offer?', 'What do I contribute if chosen?' ][ i ],
			description: 'One row per token. Queries are matched against keys to decide how much of each value to take — three different views of the same token, which is what lets a token attend to something unlike itself.',
			metric: `[${ GPT2.nHead }, ${ SEQ }, ${ GPT2.dHead }]`,
			metricLabel: 'Tensor shape',
		};
		interactables.push( panel );

		link( 0, new THREE.Vector3( x, X_Y - xPanel.userData.panel.height / 2 - 0.5, 0 ), new THREE.Vector3( x, W_Y + wall.userData.panel.height / 2 + 0.2, 0 ), THEME.ink );
		link( 0, new THREE.Vector3( x, W_Y - wall.userData.panel.height / 2 - 0.5, 0 ), new THREE.Vector3( x, QKV_Y + panel.userData.panel.height / 2 + 0.3, 0 ), tint );

	} );

	const qkvNote = caption( `${ GPT2.nHead } heads × ${ GPT2.dHead } dims = ${ GPT2.dModel }`, K_X, QKV_Y - 1.5, 'label2d label2d-dim' );

	/* ---------------------------------------------- 1 · scores and mask -- */

	const scorePanel = createMatrixPanel( { rows: SEQ, cols: SEQ, color: THEME.violet, cell: 0.3, values: scoresFor( MOCK_ATTENTION_MATRIX ) } );
	scorePanel.position.set( S_X, SCORE_Y, 0 );
	rig.add( scorePanel );
	addPanelFrame( scorePanel, { color: THEME.violet, opacity: 0.32 } );
	labelPanel( scorePanel, 'S = q kᵀ / √d_k', `[${ SEQ } × ${ SEQ }] · √d_k = ${ Math.sqrt( GPT2.dHead ).toFixed( 0 ) }` );
	labelPanelRows( scorePanel, TOKENS.map( ( t ) => t.display ) );

	scorePanel.userData.detail = {
		category: 'Scores',
		name: 'S = Q Kᵀ / √d_k',
		blurb: 'How relevant every token is to every other, before masking.',
		description: `Dividing by √d_k = ${ Math.sqrt( GPT2.dHead ).toFixed( 0 ) } stops the dot products growing with head width. Without it, softmax saturates into a one-hot spike and the gradient vanishes.`,
		metric: `[${ SEQ } × ${ SEQ }]`,
		metricLabel: 'Tensor shape',
	};
	interactables.push( scorePanel );

	// The −inf lid over the upper triangle: token i may not read token j > i.
	const maskCaps = [];
	for ( let r = 0; r < SEQ; r ++ ) {

		for ( let c = r + 1; c < SEQ; c ++ ) {

			const cap = createMaskCap( { cell: 0.3 } );
			cap.position.copy( panelCell( scorePanel, r, c ).position );
			cap.position.z = 0.11;
			scorePanel.add( cap );
			maskCaps.push( cap );

		}

	}

	const maskLabel = caption( 'causal mask · j > i set to −inf', S_X, SCORE_Y - 1.72, 'label2d label2d-dim' );

	const softmaxPlate = createOpPlate( 'softmax', 'row-wise · each row sums to 1' );
	softmaxPlate.position.set( 0, SCORE_Y + 0.25, 0 );
	rig.add( softmaxPlate );

	const attnPanel = createMatrixPanel( { rows: SEQ, cols: SEQ, color: THEME.rose, cell: 0.3, values: MOCK_ATTENTION_MATRIX } );
	attnPanel.position.set( A_X, SCORE_Y, 0 );
	rig.add( attnPanel );
	addPanelFrame( attnPanel, { color: THEME.rose, opacity: 0.32 } );
	labelPanel( attnPanel, 'A = softmax(S + M)', `[${ GPT2.nHead }, ${ SEQ }, ${ SEQ }]` );

	attnPanel.userData.detail = {
		category: 'Attention weights',
		name: 'A_h = softmax(Q_h K_hᵀ / √d_k + M)',
		blurb: 'Row i is how much token i takes from every token up to and including itself.',
		description: 'The masked cells are exactly zero after softmax, because exp(−inf) = 0. That single lid is the whole difference between a decoder and an encoder.',
		metric: `[${ GPT2.nHead }, ${ SEQ }, ${ SEQ }]`,
		metricLabel: 'Tensor shape',
	};
	interactables.push( attnPanel );

	link( 1, new THREE.Vector3( S_X + scorePanel.userData.panel.width / 2 + 0.15, SCORE_Y, 0 ), new THREE.Vector3( A_X - attnPanel.userData.panel.width / 2 - 0.15, SCORE_Y, 0 ), THEME.rose, { particleCount: 2 } );
	link( 1, new THREE.Vector3( Q_X, QKV_Y - 0.9, 0 ), new THREE.Vector3( S_X - 0.6, SCORE_Y + 1.1, 0 ), HEAD_TINT[ 0 ] );
	link( 1, new THREE.Vector3( K_X, QKV_Y - 0.9, 0 ), new THREE.Vector3( S_X + 0.6, SCORE_Y + 1.1, 0 ), HEAD_TINT[ 1 ] );

	/* ------------------------------------------------------- 2 · Z ------- */

	const zPanel = createMatrixPanel( { rows: SEQ, cols: DK, color: THEME.accent, seed: 210, cell: 0.24 } );
	zPanel.position.set( 0, Z_Y, 0 );
	rig.add( zPanel );
	addPanelFrame( zPanel, { color: THEME.accent, opacity: 0.32 } );
	labelPanel( zPanel, 'Z_h = A_h V_h', `[${ SEQ }, ${ GPT2.dHead }] — one head` );
	labelPanelRows( zPanel, TOKENS.map( ( t ) => t.display ) );

	zPanel.userData.detail = {
		category: 'Head output',
		name: 'Z_h = A_h V_h',
		blurb: 'Each row is a weighted blend of the value vectors that token was allowed to read.',
		description: 'The attention matrix supplies the mixing weights and V supplies the content. Row 4 mixes all five values; row 0 can only be its own.',
		metric: `[${ SEQ }, ${ GPT2.dHead }]`,
		metricLabel: 'Tensor shape',
	};
	interactables.push( zPanel );

	link( 2, new THREE.Vector3( A_X, SCORE_Y - 1.1, 0 ), new THREE.Vector3( 0.5, Z_Y + 0.9, 0 ), THEME.rose );
	link( 2, new THREE.Vector3( V_X, QKV_Y - 0.9, 0 ), new THREE.Vector3( 1.4, Z_Y + 0.9, 0 ), HEAD_TINT[ 2 ], { particleCount: 2 } );

	/* -------------------------------------------------- 3 · concatenate -- */

	const concatGroup = new THREE.Group();
	concatGroup.position.set( 0, CONCAT_Y, 0 );
	rig.add( concatGroup );

	const headSlices = [];
	const SLICE_STEP = 0.78;

	for ( let h = 0; h < HEAD_COUNT; h ++ ) {

		const slice = createMatrixPanel( { rows: SEQ, cols: 2, color: THEME.accent, seed: 400 + h * 23, cell: 0.24 } );
		slice.position.x = ( h - ( HEAD_COUNT - 1 ) / 2 ) * SLICE_STEP;
		concatGroup.add( slice );
		addPanelFrame( slice, { color: THEME.accent, opacity: 0.22, pad: 0.05 } );

		const tag = createLabel( String( h + 1 ), 'label2d label2d-dim' );
		tag.position.set( 0, -0.85, 0 );
		slice.add( tag );

		headSlices.push( slice );

	}

	const concatTitle = caption( `Z = Concat(Z_1 … Z_${ HEAD_COUNT })`, 0, CONCAT_Y + 1.1 );
	const concatNote = caption( `${ HEAD_COUNT } × ${ GPT2.dHead } = ${ GPT2.dModel } — no head has seen another yet`, 0, CONCAT_Y - 1.35, 'label2d label2d-dim' );

	concatGroup.userData.detail = {
		category: 'Multi-head',
		name: `Concat(Z_1 … Z_${ HEAD_COUNT })`,
		blurb: 'Twelve independent head outputs laid end to end.',
		description: 'Every head ran the whole Q/K/V → scores → mask → softmax → weighted-sum pipeline on its own 64-dimensional slice, in parallel and in ignorance of the others. Concatenation just restores the model width.',
		metric: `[${ SEQ }, ${ GPT2.dModel }]`,
		metricLabel: 'Tensor shape',
	};
	interactables.push( concatGroup );

	link( 3, new THREE.Vector3( 0, Z_Y - 0.9, 0 ), new THREE.Vector3( 0, CONCAT_Y + 0.85, 0 ), THEME.accent, { particleCount: 2 } );

	/* -------------------------------------------------------- 4 · W^O ---- */

	const wo = createWeightWall( { rows: 10, cols: 10, color: THEME.violet, seed: 77 } );
	wo.position.set( -3.2, WO_Y, 0 );
	rig.add( wo );
	labelPanel( wo, 'W^O', `[${ GPT2.dModel } × ${ GPT2.dModel }]` );

	wo.userData.detail = {
		category: 'Weight',
		name: 'W^O — output projection',
		blurb: 'The only place the heads mix with each other.',
		description: 'Remove W^O and twelve heads stay twelve independent channels bolted together. It is stored as c_proj in the GPT-2 checkpoint.',
		metric: `[${ GPT2.dModel } × ${ GPT2.dModel }]`,
		metricLabel: 'Weight shape',
	};
	interactables.push( wo );

	const attnOut = createMatrixPanel( { rows: SEQ, cols: DIMS, color: THEME.info, seed: 310 } );
	attnOut.position.set( 3.4, WO_Y, 0 );
	rig.add( attnOut );
	addPanelFrame( attnOut, { color: THEME.info, opacity: 0.3 } );
	labelPanel( attnOut, 'attn_out = Z W^O', `[1, ${ SEQ }, ${ GPT2.dModel }]` );
	labelPanelRows( attnOut, TOKENS.map( ( t ) => t.display ) );

	attnOut.userData.detail = {
		category: 'Activation',
		name: 'attn_out = Z W^O',
		blurb: 'Back at model width, ready to be added into the residual stream.',
		description: 'This is what the sub-block contributes. It does not replace anything — the next station adds it in.',
		metric: `[1, ${ SEQ }, ${ GPT2.dModel }]`,
		metricLabel: 'Tensor shape',
	};
	interactables.push( attnOut );

	link( 4, new THREE.Vector3( -1.0, CONCAT_Y - 0.9, 0 ), new THREE.Vector3( -3.2, WO_Y + 1.4, 0 ), THEME.accent );
	link( 4, new THREE.Vector3( -3.2 + wo.userData.panel.width / 2 + 0.15, WO_Y, 0 ), new THREE.Vector3( 3.4 - attnOut.userData.panel.width / 2 - 0.15, WO_Y, 0 ), THEME.info, { particleCount: 2 } );

	/* ---------------------------------------------------- 5 · residual --- */

	const addNode = createAddNode( { color: THEME.signal, radius: 0.38 } );
	addNode.position.set( -1.6, ADD_Y, 0 );
	rig.add( addNode );

	const streamIn = createMatrixPanel( { rows: SEQ, cols: 4, color: THEME.ink, seed: 501, cell: 0.2 } );
	streamIn.position.set( -5.6, ADD_Y, 0 );
	rig.add( streamIn );
	addPanelFrame( streamIn, { color: THEME.ink, opacity: 0.26 } );
	labelPanel( streamIn, 'x (before the sub-block)', null );

	const streamOut = createMatrixPanel( { rows: SEQ, cols: DIMS, color: THEME.ink, seed: 601 } );
	streamOut.position.set( 2.6, ADD_Y, 0 );
	rig.add( streamOut );
	addPanelFrame( streamOut, { color: THEME.ink, opacity: 0.32 } );
	labelPanel( streamOut, 'x ← x + attn_out', `then ln_2 → MLP → ⊕ · ${ GPT2.nLayer } blocks in all` );

	streamOut.userData.detail = {
		category: 'Residual stream',
		name: 'x ← x + attn_out',
		blurb: 'Attention writes a correction into the stream rather than overwriting it.',
		description: 'The MLP that follows reads the result, adds its own correction, and the next of the twelve blocks starts again from ln_1. Page 02 walks the whole block.',
		metric: `[1, ${ SEQ }, ${ GPT2.dModel }]`,
		metricLabel: 'Tensor shape',
	};
	interactables.push( streamOut );

	link( 5, new THREE.Vector3( -5.6 + streamIn.userData.panel.width / 2 + 0.15, ADD_Y, 0 ), new THREE.Vector3( -2.1, ADD_Y, 0 ), THEME.ink );
	link( 5, new THREE.Vector3( 3.4, WO_Y - 0.9, 0 ), new THREE.Vector3( -1.6, ADD_Y + 0.6, 0 ), THEME.info );
	link( 5, new THREE.Vector3( -1.1, ADD_Y, 0 ), new THREE.Vector3( 2.6 - streamOut.userData.panel.width / 2 - 0.15, ADD_Y, 0 ), THEME.signal, { particleCount: 2 } );

	/* -------------------------------------------------------- 6 · cost --- */

	const pairs = ( SEQ * ( SEQ + 1 ) ) / 2;
	const costLabel = caption(
		`${ pairs } scored pairs per head · × ${ HEAD_COUNT } heads × ${ GPT2.nLayer } layers = ${ pairs * HEAD_COUNT * GPT2.nLayer }`,
		S_X, SCORE_Y - 2.1,
	);

	/* ------------------------------------------------------- staging ----- */

	// Free-floating captions belong to a station too — they sit on the rig, not
	// inside a panel, so nothing else would ever turn them off.
	const STATIONS = [
		[ xPanel, ...projections, ...qkvPanels, qkvNote ],
		[ scorePanel, attnPanel, softmaxPlate, maskLabel ],
		[ attnPanel, qkvPanels[ 2 ], zPanel ],
		[ zPanel, concatGroup, concatTitle, concatNote ],
		[ concatGroup, concatTitle, wo, attnOut ],
		[ attnOut, addNode, streamIn, streamOut ],
		[ scorePanel, attnPanel, maskLabel, costLabel ],
	];

	const ALL = [
		xPanel, ...projections, ...qkvPanels, qkvNote,
		scorePanel, softmaxPlate, maskLabel, attnPanel, zPanel,
		concatGroup, concatTitle, concatNote, wo, attnOut,
		addNode, streamIn, streamOut, costLabel,
	];

	let currentStep = 0;
	let activeHead = 0;
	let computeMode = 'naive';
	let elapsed = 0;

	function highlight( index ) {

		const lit = new Set( STATIONS[ index ] );
		ALL.forEach( ( group ) => setGroupState( group, lit.has( group ) ? 'active' : 'hidden' ) );
		wiring.forEach( ( group, i ) => { group.visible = i === index; } );

		conduits.forEach( ( c ) => c.setActive( true ) );

	}

	// KV cache: K and V for earlier tokens never change, so a real decoder
	// computes them once. In cache mode every row but the newest goes cold.
	function applyComputeMode() {

		[ qkvPanels[ 1 ], qkvPanels[ 2 ] ].forEach( ( panel ) => {

			panel.userData.panel.cells.forEach( ( cell ) => {

				// Written as the material's *authored* values rather than its
				// live ones: `setGroupState` scales from these, so a station
				// that is currently hidden stays hidden instead of being lit
				// back up by whichever compute mode is selected. The cell's own
				// value sets its brightness, so k and v match q.
				const lit = 0.18 + Math.min( 1, Math.abs( cell.userData.value ) ) * 0.5;
				const cached = computeMode === 'cache' && cell.userData.row < SEQ - 1;
				cell.material.transparent = true;
				cell.material.userData.baseOpacity = cached ? 0.3 : 1;
				cell.material.userData.baseEmissive = cached ? lit * 0.25 : lit;

			} );

			setGroupState( panel, STATIONS[ currentStep ].includes( panel ) ? 'active' : 'hidden' );

		} );

	}

	function setHead( headIndex ) {

		activeHead = THREE.MathUtils.clamp( headIndex, 0, HEAD_COUNT - 1 );
		const matrix = HEAD_MATRICES[ activeHead ];

		setPanelValues( attnPanel, matrix, { color: THEME.rose } );
		setPanelValues( scorePanel, scoresFor( matrix ), { color: THEME.violet } );

		// Every q/k/v/Z slice is a different projection of the same input, so
		// switching head reseeds them rather than merely recolouring.
		qkvPanels.forEach( ( panel, i ) => {

			const p = panel.userData.panel;
			setPanelValues( panel, p.cells.map( ( _, c ) => seeded( 120 + i * 41 + activeHead * 7 + c * 3 ) ) );

		} );
		setPanelValues( zPanel, zPanel.userData.panel.cells.map( ( _, c ) => seeded( 210 + activeHead * 11 + c * 3 ) ) );

		headSlices.forEach( ( slice, h ) => {

			const on = h === activeHead;
			slice.userData.panel.cells.forEach( ( cell ) => {

				cell.material.transparent = true;
				cell.material.opacity = on ? 1 : 0.34;
				cell.material.emissiveIntensity = on ? 0.7 : 0.15;

			} );
			const targetZ = on ? 0.42 : 0;
			const fromZ = slice.position.z;
			tween( 0.4, ( t ) => { slice.position.z = THREE.MathUtils.lerp( fromZ, targetZ, t ); }, { easing: Easing.cubicOut } );

		} );

		applyComputeMode();

	}

	highlight( 0 );
	setHead( 0 );

	return {
		scene,
		interactables,
		totalSteps: ATTENTION_STEPS.length,
		getStepView( index, camera ) {

			return fitView( boundsOf( STATIONS[ Math.max( 0, Math.min( STATIONS.length - 1, index ) ) ] ), camera, { fillX: 0.80, fillY: 0.52, biasY: 0.05 } );

		},
		goToStep( index ) {

			currentStep = Math.max( 0, Math.min( ATTENTION_STEPS.length - 1, index ) );
			highlight( currentStep );
			applyComputeMode();

		},
		setComputeMode( mode ) {

			computeMode = mode === 'cache' ? 'cache' : 'naive';
			applyComputeMode();

		},
		setHead,
		update( dt ) {

			elapsed += dt;
			for ( const c of conduits ) c.update( dt );

			// On the cost step the causal triangle counts itself out, cell by
			// cell, so "quadratic" is something you watch rather than read.
			if ( currentStep === 6 ) {

				const phase = ( elapsed * 3 ) % ( pairs + 6 );
				let n = 0;
				for ( let r = 0; r < SEQ; r ++ ) {

					for ( let c = 0; c <= r; c ++ ) {

						const cell = panelCell( scorePanel, r, c );
						cell.material.emissiveIntensity = n < phase ? 1.1 : 0.15;
						n ++;

					}

				}

			}

			maskCaps.forEach( ( cap, i ) => {

				cap.position.z = 0.11 + Math.sin( elapsed * 1.6 + i ) * 0.012;

			} );

		},
	};

}
