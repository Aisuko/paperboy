import * as THREE from 'three';
import { BLOCK_STAGES } from '../data/blockStages.js';
import { GPT2 } from '../data/gpt2.js';
import { TOKENS } from '../data/tokens.js';
import { addStandardLighting, createDeck, createLabel, THEME } from '../utils/sceneKit.js';
import {
	seeded, createMatrixPanel, createVectorStrip, createWeightWall, createStreamBand,
	addPanelFrame, labelPanel, labelPanelRows, panelCell, createAddNode, createMaskCap, createOpPlate,
	Conduit, setGroupState, boundsOf, fitView,
} from '../utils/tensorKit.js';

// 02 · One decoder block, stage by stage.
//
// The page is a ladder: the residual stream runs down the left as a band of
// five lanes (one per token), and each of the six stages hangs off it to the
// right as the tensors that stage actually touches. Nothing here is a generic
// "module" — a LayerNorm is the panel going in, the γ/β strips, and the panel
// coming out; an MLP is the two weight walls and the 4× wider activation
// between them; a residual add is a ⊕ with two conduits in and one out.
//
// GPT-2 is pre-LN: ln_1 → attention → ⊕ → ln_2 → MLP → ⊕.

const SEQ = TOKENS.length;
const DIMS = 8; // of 768 drawn per activation panel
const FF_DIMS = 16; // of 3072 — twice DIMS, so "4× wider" reads as wider

const SPAN = 3.4; // vertical distance between stages
const TOP_Y = 4.6;
const SPINE_X = -7.6;
const STAGE_X = 0.6;

const STAGE_COLORS = [ THEME.accent, THEME.info, THEME.signal, THEME.accent, THEME.violet, THEME.signal ];

function activation( color, { rows = SEQ, cols = DIMS, seed = 0 } = {} ) {

	const panel = createMatrixPanel( { rows, cols, color, seed } );
	addPanelFrame( panel, { color, opacity: 0.28 } );
	return panel;

}

// Normalised values: same sign pattern, magnitudes pulled towards 1 — what
// LayerNorm does, drawn rather than asserted.
function normalised( seed, count ) {

	return Array.from( { length: count }, ( _, i ) => {

		const v = seeded( seed + i * 3 );
		return Math.sign( v ) * ( 0.55 + Math.abs( v ) * 0.35 );

	} );

}

export function buildBlockWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene );
	scene.add( createDeck( 44, { y: -16.5, divisions: 88 } ) );

	const rig = new THREE.Group();
	scene.add( rig );

	const conduits = [];
	const stageGroups = [];
	const interactables = [];

	// Wiring that runs between stations lives in the destination stage's own
	// wiring group, so hiding a stage takes its conduits with it instead of
	// leaving long curves sweeping across the frame of whatever is on screen.
	const wiring = BLOCK_STAGES.map( () => {

		const group = new THREE.Group();
		rig.add( group );
		return group;

	} );

	function link( group, from, to, color, opts = {} ) {

		const c = new Conduit( group, [ from, from.clone().lerp( to, 0.5 ), to ], color, { particleCount: 1, speed: 0.45, ...opts } );
		conduits.push( c );
		return c;

	}

	/* ------------------------------------------------------- the spine --- */

	const spine = createStreamBand( {
		cols: SEQ, segments: 96, axis: 'y', cell: 0.16, gap: 0.05, color: THEME.ink, seed: 3, opacity: 0.55,
	} );
	spine.position.set( SPINE_X, TOP_Y - SPAN * 2.5, 0 );
	rig.add( spine );

	const spineLabel = createLabel( `residual stream · [1, ${ SEQ }, ${ GPT2.dModel }]`, 'label2d label2d-key' );
	spineLabel.position.set( SPINE_X, TOP_Y + 1.5, 0 );
	rig.add( spineLabel );

	const spineNote = createLabel( 'never overwritten — every sub-block adds a correction', 'label2d label2d-dim' );
	spineNote.position.set( SPINE_X, TOP_Y + 1.18, 0 );
	rig.add( spineNote );

	/* ------------------------------------------------- stage builders ---- */

	// Each builder fills `group` and returns the local x of its input port and
	// its output port, so the ladder can wire stages together without every
	// builder having to know where it sits.

	function buildLayerNorm( group, color, index ) {

		const IN_X = -3.4, OP_X = -0.6, OUT_X = 2.6;
		const which = index === 0 ? '1' : '2';

		const input = activation( color, { seed: 40 + index * 11 } );
		input.position.x = IN_X;
		group.add( input );
		labelPanel( input, 'x', `[1, ${ SEQ }, ${ GPT2.dModel }]` );
		labelPanelRows( input, TOKENS.map( ( t ) => t.display ) );

		const plate = createOpPlate( `ln_${ which }`, 'per-token mean / var over 768' );
		plate.position.set( OP_X, 0.95, 0 );
		group.add( plate );

		// γ and β: one learned value per feature, so one cell per drawn dim.
		const gamma = createVectorStrip( { length: DIMS, color: THEME.violet, seed: 70 + index } );
		gamma.position.set( OP_X, 0.2, 0 );
		group.add( gamma );
		labelPanel( gamma, null, `γ  [${ GPT2.dModel }]`, { gap: 0.26 } );

		const beta = createVectorStrip( { length: DIMS, color: THEME.violet, seed: 90 + index } );
		beta.position.set( OP_X, -0.72, 0 );
		group.add( beta );
		labelPanel( beta, null, `β  [${ GPT2.dModel }]`, { gap: 0.26 } );

		const output = createMatrixPanel( {
			rows: SEQ, cols: DIMS, color, values: normalised( 200 + index * 13, SEQ * DIMS ),
		} );
		addPanelFrame( output, { color, opacity: 0.28 } );
		output.position.x = OUT_X;
		group.add( output );
		labelPanel( output, 'x̂', 'mean 0 · var 1, then γ ⊙ x̂ + β' );

		link( group, new THREE.Vector3( IN_X + input.userData.panel.width / 2 + 0.15, 0, 0 ), new THREE.Vector3( OP_X - 0.9, 0, 0 ), color );
		link( group, new THREE.Vector3( OP_X + 0.9, 0, 0 ), new THREE.Vector3( OUT_X - output.userData.panel.width / 2 - 0.15, 0, 0 ), color );

		return { inX: IN_X - input.userData.panel.width / 2, outX: OUT_X + output.userData.panel.width / 2 };

	}

	function buildAttention( group, color ) {

		const IN_X = -5.2, W_X = -2.8, QKV_X = -0.2, A_X = 2.6, OUT_X = 5.6;

		const input = activation( color, { seed: 12 } );
		input.position.x = IN_X;
		group.add( input );
		labelPanel( input, 'x̂', `[1, ${ SEQ }, ${ GPT2.dModel }]` );

		const cAttn = createWeightWall( { rows: 12, cols: 8, color: THEME.violet, seed: 31 } );
		cAttn.position.x = W_X;
		group.add( cAttn );
		labelPanel( cAttn, 'c_attn', `[${ GPT2.dModel } × ${ 3 * GPT2.dModel }]` );

		// q, k, v: three [5 × 64] slices, stacked so the split is visible.
		const qkv = [];
		[ [ 'q', THEME.info, 1.0 ], [ 'k', THEME.accent, 0 ], [ 'v', THEME.signal, -1.0 ] ].forEach( ( [ name, tint, y ], i ) => {

			const panel = createMatrixPanel( { rows: SEQ, cols: 4, color: tint, seed: 300 + i * 17, cell: 0.14, gap: 0.035 } );
			panel.position.set( QKV_X, y, 0 );
			group.add( panel );
			labelPanel( panel, null, `${ name }  [${ GPT2.nHead }, ${ SEQ }, ${ GPT2.dHead }]`, { gap: 0.24 } );
			qkv.push( panel );
			link( group, new THREE.Vector3( W_X + cAttn.userData.panel.width / 2 + 0.1, 0, 0 ), new THREE.Vector3( QKV_X - 0.45, y, 0 ), tint );

		} );

		// The [5 × 5] causal attention matrix, with the −inf lid already on.
		const attn = createMatrixPanel( { rows: SEQ, cols: SEQ, color: THEME.rose, seed: 55, cell: 0.22 } );
		attn.position.x = A_X;
		group.add( attn );
		addPanelFrame( attn, { color: THEME.rose, opacity: 0.3 } );
		labelPanel( attn, 'softmax(qkᵀ/√d_k + M)', `[${ GPT2.nHead }, ${ SEQ }, ${ SEQ }]` );

		for ( let r = 0; r < SEQ; r ++ ) {

			for ( let c = r + 1; c < SEQ; c ++ ) {

				const cap = createMaskCap( { cell: 0.22 } );
				cap.position.copy( panelCell( attn, r, c ).position );
				cap.position.z = 0.09;
				attn.add( cap );

			}

		}

		const output = activation( color, { seed: 77 } );
		output.position.x = OUT_X;
		group.add( output );
		labelPanel( output, 'attn_out', `c_proj [${ GPT2.dModel } × ${ GPT2.dModel }]` );

		link( group, new THREE.Vector3( IN_X + input.userData.panel.width / 2 + 0.15, 0, 0 ), new THREE.Vector3( W_X - cAttn.userData.panel.width / 2 - 0.1, 0, 0 ), color );
		link( group, new THREE.Vector3( QKV_X + 0.45, 0, 0 ), new THREE.Vector3( A_X - attn.userData.panel.width / 2 - 0.1, 0, 0 ), THEME.rose );
		link( group, new THREE.Vector3( A_X + attn.userData.panel.width / 2 + 0.1, 0, 0 ), new THREE.Vector3( OUT_X - output.userData.panel.width / 2 - 0.15, 0, 0 ), color );

		const more = createLabel( '03 Attention walks this station through step by step', 'label2d label2d-dim' );
		more.position.set( QKV_X + 1.2, -1.85, 0 );
		group.add( more );

		return { inX: IN_X - input.userData.panel.width / 2, outX: OUT_X + output.userData.panel.width / 2 };

	}

	function buildResidualAdd( group, color, index ) {

		const STREAM_IN_X = -4.6, SUB_IN_X = -4.6, NODE_X = -1.2, OUT_X = 2.2;
		const contribution = index === 0 ? 'attn_out' : 'mlp_out';

		// Both summands are drawn, or the ⊕ has nothing visible going into it:
		// the stream as it stood before the sub-block, and the correction the
		// sub-block just computed.
		const streamIn = activation( THEME.ink, { cols: 4, seed: 150 + index } );
		streamIn.position.set( STREAM_IN_X, 0.95, 0 );
		group.add( streamIn );
		labelPanel( streamIn, 'x', null, { gap: 0.28 } );

		const subIn = activation( STAGE_COLORS[ index === 0 ? 1 : 4 ], { cols: 4, seed: 170 + index } );
		subIn.position.set( SUB_IN_X, -0.95, 0 );
		group.add( subIn );
		labelPanel( subIn, contribution, null, { gap: 0.28 } );

		const node = createAddNode( { color, radius: 0.34 } );
		node.position.set( NODE_X, 0, 0 );
		group.add( node );

		const output = activation( color, { seed: 130 + index * 9 } );
		output.position.x = OUT_X;
		group.add( output );
		labelPanel( output, 'x', `x + ${ contribution }  ·  [1, ${ SEQ }, ${ GPT2.dModel }]` );

		link( group, new THREE.Vector3( STREAM_IN_X + streamIn.userData.panel.width / 2 + 0.15, 0.95, 0 ), new THREE.Vector3( NODE_X - 0.45, 0.2, 0 ), THEME.ink );
		link( group, new THREE.Vector3( SUB_IN_X + subIn.userData.panel.width / 2 + 0.15, -0.95, 0 ), new THREE.Vector3( NODE_X - 0.45, -0.2, 0 ), STAGE_COLORS[ index === 0 ? 1 : 4 ] );
		link( group, new THREE.Vector3( NODE_X + 0.45, 0, 0 ), new THREE.Vector3( OUT_X - output.userData.panel.width / 2 - 0.15, 0, 0 ), color );

		return { inX: STREAM_IN_X - streamIn.userData.panel.width / 2, outX: OUT_X + output.userData.panel.width / 2, nodeX: NODE_X };

	}

	function buildMlp( group, color ) {

		const IN_X = -5.4, FC_X = -2.9, HID_X = 0.4, PROJ_X = 3.6, OUT_X = 6.0;

		const input = activation( color, { seed: 21 } );
		input.position.x = IN_X;
		group.add( input );
		labelPanel( input, 'x̂', `[1, ${ SEQ }, ${ GPT2.dModel }]` );

		const cFc = createWeightWall( { rows: 8, cols: 14, color: THEME.violet, seed: 41 } );
		cFc.position.x = FC_X;
		group.add( cFc );
		labelPanel( cFc, 'c_fc', `[${ GPT2.dModel } × ${ GPT2.dFF }]` );

		// The 4× wider activation, with GELU's asymmetry drawn in: negatives
		// are squashed towards zero, positives pass through.
		const hidden = createMatrixPanel( {
			rows: SEQ, cols: FF_DIMS, color: THEME.violet, cell: 0.15, gap: 0.035,
			values: Array.from( { length: SEQ * FF_DIMS }, ( _, i ) => {

				const v = seeded( 500 + i * 3 );
				return v > 0 ? v : v * 0.12;

			} ),
		} );
		hidden.position.x = HID_X;
		group.add( hidden );
		addPanelFrame( hidden, { color: THEME.violet, opacity: 0.28 } );
		labelPanel( hidden, 'GELU(x W₁ + b₁)', `[1, ${ SEQ }, ${ GPT2.dFF }] — 4× wider` );

		const cProj = createWeightWall( { rows: 14, cols: 8, color: THEME.violet, seed: 61 } );
		cProj.position.x = PROJ_X;
		group.add( cProj );
		labelPanel( cProj, 'c_proj', `[${ GPT2.dFF } × ${ GPT2.dModel }]` );

		const output = activation( color, { seed: 91 } );
		output.position.x = OUT_X;
		group.add( output );
		labelPanel( output, 'mlp_out', `≈ ${ ( ( 2 * GPT2.dModel * GPT2.dFF ) / 1e6 ).toFixed( 1 ) }M params — two-thirds of the block` );

		link( group, new THREE.Vector3( IN_X + input.userData.panel.width / 2 + 0.15, 0, 0 ), new THREE.Vector3( FC_X - cFc.userData.panel.width / 2 - 0.1, 0, 0 ), color );
		link( group, new THREE.Vector3( FC_X + cFc.userData.panel.width / 2 + 0.1, 0, 0 ), new THREE.Vector3( HID_X - hidden.userData.panel.width / 2 - 0.1, 0, 0 ), THEME.violet );
		link( group, new THREE.Vector3( HID_X + hidden.userData.panel.width / 2 + 0.1, 0, 0 ), new THREE.Vector3( PROJ_X - cProj.userData.panel.width / 2 - 0.1, 0, 0 ), THEME.violet );
		link( group, new THREE.Vector3( PROJ_X + cProj.userData.panel.width / 2 + 0.1, 0, 0 ), new THREE.Vector3( OUT_X - output.userData.panel.width / 2 - 0.15, 0, 0 ), color );

		return { inX: IN_X - input.userData.panel.width / 2, outX: OUT_X + output.userData.panel.width / 2 };

	}

	const BUILDERS = {
		'layernorm': buildLayerNorm,
		'self-attention': buildAttention,
		'residual-add': buildResidualAdd,
		'mlp': buildMlp,
	};

	/* ------------------------------------------------------ the ladder --- */

	let normIndex = 0, addIndex = 0;

	BLOCK_STAGES.forEach( ( stage, i ) => {

		const group = new THREE.Group();
		group.position.set( STAGE_X, TOP_Y - i * SPAN, 0 );
		group.userData.stepIndex = i;
		rig.add( group );

		const color = STAGE_COLORS[ i ];
		const localIndex = stage.type === 'layernorm' ? normIndex ++ : ( stage.type === 'residual-add' ? addIndex ++ : 0 );
		const ports = BUILDERS[ stage.type ]( group, color, localIndex );

		const heading = createLabel( `${ i + 1 }. ${ stage.title }`, 'label2d label2d-key' );
		heading.position.set( ports.inX - 0.9, 1.55, 0 );
		group.add( heading );

		const formula = createLabel( stage.formula, 'label2d label2d-dim' );
		formula.position.set( ports.inX - 0.9, 1.24, 0 );
		group.add( formula );

		group.userData.detail = {
			category: `Stage ${ i + 1 } of ${ BLOCK_STAGES.length }`,
			name: stage.title,
			blurb: stage.formula,
			description: stage.description,
		};
		interactables.push( group );

		group.userData.ports = ports;
		stageGroups.push( group );

	} );

	/* --------------------------------------------- spine ↔ stage wiring -- */

	// Read taps: the spine feeds ln_1 and ln_2. Write taps: each ⊕ pulls the
	// stream in from the left and pushes the updated stream back out.
	function tap( stageIndex, { read } ) {

		const group = stageGroups[ stageIndex ];
		const y = group.position.y;
		const port = group.position.x + ( read ? group.userData.ports.inX : group.userData.ports.nodeX ?? group.userData.ports.inX );
		const spineEdge = new THREE.Vector3( SPINE_X + spine.userData.stream.width / 2 + 0.1, y, 0 );
		const stagePort = new THREE.Vector3( port - 0.25, y, 0 );
		const c = new Conduit( wiring[ stageIndex ], [ spineEdge, spineEdge.clone().lerp( stagePort, 0.5 ).setY( y + 0.35 ), stagePort ], read ? THEME.ink : THEME.signal, { particleCount: 2, speed: 0.4 } );
		conduits.push( c );
		return c;

	}

	[ 0, 3 ].forEach( ( i ) => tap( i, { read: true } ) );
	[ 2, 5 ].forEach( ( i ) => tap( i, { read: false } ) );

	// Write-back: each ⊕ output returns to the spine below it.
	[ 2, 5 ].forEach( ( i ) => {

		const group = stageGroups[ i ];
		const y = group.position.y;
		const from = new THREE.Vector3( group.position.x + group.userData.ports.outX + 0.15, y, 0 );
		const to = new THREE.Vector3( SPINE_X + spine.userData.stream.width / 2 + 0.1, y - 1.2, 0 );
		conduits.push( new Conduit( wiring[ i ], [ from, new THREE.Vector3( from.x + 1.6, y - 0.6, 0 ), new THREE.Vector3( SPINE_X + 2.4, y - 1.2, 0 ), to ], THEME.signal, { particleCount: 2, speed: 0.4, radius: 0.034 } ) );

	} );

	// Stage n's output feeds stage n+1's input, except across the ⊕s, which are
	// fed by the spine tap instead.
	for ( let i = 0; i < stageGroups.length - 1; i ++ ) {

		if ( BLOCK_STAGES[ i + 1 ].type === 'residual-add' ) {

			const a = stageGroups[ i ], b = stageGroups[ i + 1 ];
			const from = new THREE.Vector3( a.position.x + a.userData.ports.outX + 0.15, a.position.y, 0 );
			const to = new THREE.Vector3( b.position.x + b.userData.ports.nodeX, b.position.y + 0.5, 0 );
			conduits.push( new Conduit( wiring[ i + 1 ], [ from, new THREE.Vector3( from.x + 0.9, a.position.y - SPAN * 0.5, 0 ), to ], STAGE_COLORS[ i ], { particleCount: 2, speed: 0.4 } ) );

		} else {

			const a = stageGroups[ i ], b = stageGroups[ i + 1 ];
			const from = new THREE.Vector3( a.position.x + a.userData.ports.outX + 0.15, a.position.y, 0 );
			const to = new THREE.Vector3( b.position.x + b.userData.ports.inX - 0.15, b.position.y, 0 );
			conduits.push( new Conduit( wiring[ i + 1 ], [ from, new THREE.Vector3( from.x + 1.0, ( a.position.y + b.position.y ) / 2, 0 ), new THREE.Vector3( to.x - 1.0, ( a.position.y + b.position.y ) / 2, 0 ), to ], STAGE_COLORS[ i ], { particleCount: 2, speed: 0.4 } ) );

		}

	}

	const outLabel = createLabel( `× ${ GPT2.nLayer } blocks → ln_f → 04 Output`, 'label2d label2d-key' );
	outLabel.position.set( SPINE_X, TOP_Y - SPAN * 5 - 2.4, 0 );
	rig.add( outLabel );

	/* ------------------------------------------------------- staging ----- */

	function highlight( index ) {

		// Only the active stage is drawn. The stages are barely two screens
		// apart at the distance the widest of them needs, so leaving the
		// neighbours dimmed rather than hidden puts a second stage's panels and
		// labels in frame alongside the one being explained.
		stageGroups.forEach( ( group, i ) => {

			setGroupState( group, i === index ? 'active' : 'hidden' );
			wiring[ i ].visible = i === index;

		} );

		conduits.forEach( ( c ) => c.setActive( true ) );

	}

	highlight( 0 );

	// The camera frames one stage at a time; each stage is wider than it is
	// tall, so the lens pulls back far enough to hold its whole row.
	function viewFor( index, camera ) {

		// A minimum distance keeps the sparsest stage — a ⊕ and two panels — from
		// being zoomed until its conduits read as pipes.
		return fitView( boundsOf( [ stageGroups[ Math.max( 0, Math.min( stageGroups.length - 1, index ) ) ] ] ), camera, { minDistance: 13 } );

	}

	let elapsed = 0;

	return {
		scene,
		interactables,
		totalSteps: BLOCK_STAGES.length,
		getStepView: viewFor,
		goToStep( index ) {

			highlight( Math.max( 0, Math.min( stageGroups.length - 1, index ) ) );

		},
		update( dt ) {

			elapsed += dt;
			for ( const c of conduits ) c.update( dt );

			const cells = spine.userData.stream.cells;
			for ( let i = 0; i < cells.length; i ++ ) {

				const mesh = cells[ i ];
				mesh.material.emissiveIntensity = 0.28 + 0.3 * ( 0.5 + 0.5 * Math.sin( elapsed * 2.0 - mesh.userData.segment * 0.35 ) );

			}

		},
	};

}
