import * as THREE from 'three';
import { TOKENS } from '../data/tokens.js';
import { GPT2 } from '../data/gpt2.js';
import { VOCAB_SIZE } from '../data/vocab.js';
import { addStandardLighting, createDeck, createLabel, THEME } from '../utils/sceneKit.js';
import {
	STEP, seeded, createMatrixPanel, createVectorStrip, createWeightWall, createStreamBand,
	addPanelFrame, labelPanel, labelPanelRows, panelCell, cellPosition, createAddNode, createOpPlate,
	Conduit, setGroupState, boundsOf, fitView,
} from '../utils/tensorKit.js';
import { tween, Easing } from '../utils/tween.js';

// 01 · Embeddings. The first third of the architecture: token embeddings,
// positional encoding, and the residual stream they are added into.
//
// Every object here is the tensor it stands for. An id is one cell; a lookup
// table is a wall of cells you index a row out of; an activation is a
// [tokens × features] panel; the sum of two of them is a ⊕ junction.
//
//   stage 0  input_ids     [1, 5]                       one cell per token
//   stage 1  wte[ids]      [50257, 768] → [1, 5, 768]   a row pulled per token
//   stage 2  wpe[pos]      [1024, 768]  → [1, 5, 768]   a row pulled per slot
//   stage 3  x = wte + wpe [1, 5, 768]                  the residual stream

const SEQ = TOKENS.length;
const DIMS_DRAWN = 12; // of 768 — the panel says so underneath

const ID_X = -8.4;
const WTE_X = -3.6;
const TOK_X = -0.4;
const WPE_X = -3.6;
const POS_X = -0.4;
const SUM_X = 3.2;
const STREAM_X = 6.6;

const TOK_Y = 1.9;
const POS_Y = -2.1;

// Token-embedding stand-ins keyed on the real BPE id, so the same token draws
// the same row on every page that shows one.
function tokenRow( token, dims ) {

	return Array.from( { length: dims }, ( _, d ) => seeded( token.id * 0.37 + d * 5 ) );

}

// GPT-2 *learns* wpe rather than using the 2017 paper's fixed sinusoids, but a
// sinusoidal row is the readable picture of "position, encoded" — the panel
// caption says which is which so the drawing never claims otherwise.
function positionRow( position, dims ) {

	return Array.from( { length: dims }, ( _, d ) => {

		const wavelength = Math.pow( 10000, ( 2 * Math.floor( d / 2 ) ) / GPT2.dModel );
		return d % 2 === 0 ? Math.sin( position / wavelength ) : Math.cos( position / wavelength );

	} );

}

export function buildTokenizeWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene );
	scene.add( createDeck( 34, { y: -5.2, divisions: 68 } ) );

	const rig = new THREE.Group();
	scene.add( rig );

	const interactables = [];
	const conduits = [];

	// Conduits belong to the stage they explain, so stepping away takes the
	// plumbing off screen instead of leaving curves across the next stage.
	const wiring = [ 0, 1, 2, 3 ].map( () => {

		const group = new THREE.Group();
		rig.add( group );
		return group;

	} );

	function station( x, y, title, sub ) {

		const plate = createOpPlate( title, sub );
		plate.position.set( x, y, 0 );
		rig.add( plate );
		return plate;

	}

	/* ------------------------------------------------ 0 · input_ids ------ */

	const idsGroup = new THREE.Group();
	idsGroup.position.set( ID_X, TOK_Y - 1.0, 0 );
	rig.add( idsGroup );

	const idStrip = createVectorStrip( {
		length: SEQ, axis: 'y', cell: 0.52, gap: 0.16, depth: 0.14, color: THEME.info,
		values: TOKENS.map( ( t ) => 0.55 + ( t.id % 97 ) / 200 ),
	} );
	idsGroup.add( idStrip );
	addPanelFrame( idStrip, { color: THEME.info, opacity: 0.28, pad: 0.16 } );
	labelPanel( idStrip, 'input_ids', `[1, ${ SEQ }] · int64`, { gap: 0.5 } );

	TOKENS.forEach( ( token, i ) => {

		const cell = panelCell( idStrip, i, 0 );

		const name = createLabel( token.display, 'label2d label2d-key' );
		name.position.set( -0.95, 0, 0 );
		cell.add( name );

		const id = createLabel( String( token.id ), 'label2d label2d-dim' );
		id.position.set( 0.85, 0, 0 );
		cell.add( id );

		cell.userData.detail = {
			category: 'Token',
			name: `"${ token.text }"  (id ${ token.id })`,
			blurb: `Position ${ token.position } in the sequence.`,
			description: 'GPT-2 byte-pair encoding treats a leading space as part of the token, so " weather" and "weather" are two different ids. The id is not a number the model does arithmetic on — it is a row index into the embedding table.',
			metric: `wte[${ token.id }] + wpe[${ token.position }]`,
			metricLabel: 'Embedding lookup',
		};
		interactables.push( cell );

	} );

	const idsPlate = station( ID_X, TOK_Y + 1.5, 'tokenise', `BPE · vocab ${ VOCAB_SIZE.toLocaleString( 'en-AU' ) }` );

	/* ------------------------------------------------ 1 · wte ------------ */

	const wteGroup = new THREE.Group();
	wteGroup.position.set( WTE_X, TOK_Y, 0 );
	rig.add( wteGroup );

	const wte = createWeightWall( { rows: 14, cols: 10, color: THEME.violet, seed: 5 } );
	wteGroup.add( wte );
	labelPanel( wte, 'wte', `[${ VOCAB_SIZE.toLocaleString( 'en-AU' ) } × ${ GPT2.dModel }]`, { gap: 0.42 } );

	wte.userData.detail = {
		category: 'Weight',
		name: 'wte — token embedding table',
		blurb: 'One learned row per vocabulary entry.',
		description: `Looking a token up is not a matrix multiply, it is a row index: row ${ TOKENS[ 0 ].id } is the embedding of "How". The same weight is reused transposed as the output head on page 04, which is why a token scores highly exactly when the final hidden state points along its own row.`,
		metric: `${ ( VOCAB_SIZE * GPT2.dModel / 1e6 ).toFixed( 1 ) }M parameters`,
		metricLabel: 'Size',
	};
	interactables.push( wte );

	// The rows this sequence actually pulls out — lit inside the cold wall.
	const wteRows = [ 2, 5, 7, 10, 12 ];
	wteRows.forEach( ( r, i ) => {

		for ( let c = 0; c < 10; c ++ ) {

			const cell = panelCell( wte, r, c );
			cell.material.emissiveIntensity = 1.1;
			cell.userData.pickedBy = i;

		}

	} );

	const tokEmbed = createMatrixPanel( {
		rows: SEQ, cols: DIMS_DRAWN, color: THEME.accent,
		values: TOKENS.flatMap( ( t ) => tokenRow( t, DIMS_DRAWN ) ),
	} );
	tokEmbed.position.set( TOK_X, TOK_Y, 0 );
	rig.add( tokEmbed );
	addPanelFrame( tokEmbed, { color: THEME.accent, opacity: 0.3 } );
	labelPanel( tokEmbed, 'token embeddings', `[1, ${ SEQ }, ${ GPT2.dModel }] · ${ DIMS_DRAWN } of ${ GPT2.dModel } dims drawn` );
	labelPanelRows( tokEmbed, TOKENS.map( ( t ) => t.display ) );

	tokEmbed.userData.detail = {
		category: 'Activation',
		name: 'wte[input_ids]',
		blurb: 'One 768-dimensional vector per token, straight out of the table.',
		description: 'At this point the five vectors carry no information about their order — the same five tokens shuffled would produce the same five rows. That is exactly the gap positional encoding fills.',
		metric: `[1, ${ SEQ }, ${ GPT2.dModel }]`,
		metricLabel: 'Tensor shape',
	};
	interactables.push( tokEmbed );

	const tokPlate = station( TOK_X, TOK_Y + 2.05, 'token embeddings', 'a row lookup, not a multiply' );

	// ids → wte rows → the token-embedding panel.
	TOKENS.forEach( ( token, i ) => {

		const from = new THREE.Vector3( ID_X + 0.35, TOK_Y - 1.0 + ( ( SEQ - 1 ) / 2 - i ) * 0.68, 0 );
		const row = cellPosition( wte, wteRows[ i ], 9 ).add( wteGroup.position );
		const to = new THREE.Vector3( TOK_X - tokEmbed.userData.panel.width / 2 - 0.1, TOK_Y + ( ( SEQ - 1 ) / 2 - i ) * STEP, 0 );

		conduits.push( new Conduit( wiring[ 1 ], [ from, from.clone().lerp( row, 0.6 ), row ], THEME.info, { particleCount: 1, speed: 0.5 } ) );
		conduits.push( new Conduit( wiring[ 1 ], [ row, row.clone().lerp( to, 0.5 ), to ], THEME.accent, { particleCount: 1, speed: 0.5 } ) );

	} );

	/* ------------------------------------------------ 2 · wpe ------------ */

	const wpeGroup = new THREE.Group();
	wpeGroup.position.set( WPE_X, POS_Y, 0 );
	rig.add( wpeGroup );

	const wpe = createWeightWall( { rows: 10, cols: 10, color: THEME.violet, seed: 23 } );
	wpeGroup.add( wpe );
	labelPanel( wpe, 'wpe', `[${ GPT2.contextLength } × ${ GPT2.dModel }]`, { gap: 0.42 } );

	wpe.userData.detail = {
		category: 'Weight',
		name: 'wpe — positional encoding table',
		blurb: 'One learned row per slot in the context window.',
		description: `GPT-2 learns these ${ GPT2.contextLength } rows rather than using the fixed sine/cosine encoding of the 2017 paper. The drawing shows a sinusoidal pattern because it is the readable picture of "position"; the real table is trained, and it is why the model can only see ${ GPT2.contextLength } tokens at once.`,
		metric: `[${ GPT2.contextLength } × ${ GPT2.dModel }]`,
		metricLabel: 'Weight shape',
	};
	interactables.push( wpe );

	for ( let i = 0; i < SEQ; i ++ ) {

		for ( let c = 0; c < 10; c ++ ) panelCell( wpe, i, c ).material.emissiveIntensity = 1.1;

	}

	const posEmbed = createMatrixPanel( {
		rows: SEQ, cols: DIMS_DRAWN, color: THEME.signal,
		values: TOKENS.flatMap( ( t ) => positionRow( t.position, DIMS_DRAWN ) ),
	} );
	posEmbed.position.set( POS_X, POS_Y, 0 );
	rig.add( posEmbed );
	addPanelFrame( posEmbed, { color: THEME.signal, opacity: 0.3 } );
	labelPanel( posEmbed, 'positional encoding', `[1, ${ SEQ }, ${ GPT2.dModel }]` );
	labelPanelRows( posEmbed, TOKENS.map( ( t ) => `pos ${ t.position }` ) );

	posEmbed.userData.detail = {
		category: 'Activation',
		name: 'wpe[0 … 4]',
		blurb: 'One vector per position, identical for whatever token lands there.',
		description: 'Row 3 is the same whether position 3 holds " weather" or " Tuesday". Adding it is what lets self-attention tell "dog bites man" from "man bites dog" — without it, attention is a bag of words.',
		metric: `[1, ${ SEQ }, ${ GPT2.dModel }]`,
		metricLabel: 'Tensor shape',
	};
	interactables.push( posEmbed );

	const posPlate = station( POS_X, POS_Y + 2.05, 'positional encoding', 'learned in GPT-2, sinusoidal in the 2017 paper' );

	for ( let i = 0; i < SEQ; i ++ ) {

		const row = cellPosition( wpe, i, 9 ).add( wpeGroup.position );
		const to = new THREE.Vector3( POS_X - posEmbed.userData.panel.width / 2 - 0.1, POS_Y + ( ( SEQ - 1 ) / 2 - i ) * STEP, 0 );
		conduits.push( new Conduit( wiring[ 2 ], [ row, row.clone().lerp( to, 0.5 ), to ], THEME.signal, { particleCount: 1, speed: 0.5 } ) );

	}

	/* ------------------------------------------------ 3 · x = sum -------- */

	const addNode = createAddNode( { color: THEME.signal, radius: 0.28 } );
	addNode.position.set( SUM_X - 1.5, ( TOK_Y + POS_Y ) / 2, 0 );
	rig.add( addNode );

	const addLabel = createLabel( 'elementwise add', 'label2d label2d-dim' );
	addLabel.position.set( 0, -0.62, 0 );
	addNode.add( addLabel );

	const residual = createMatrixPanel( {
		rows: SEQ, cols: DIMS_DRAWN, color: THEME.ink,
		values: TOKENS.flatMap( ( t ) => {

			const a = tokenRow( t, DIMS_DRAWN );
			const b = positionRow( t.position, DIMS_DRAWN );
			return a.map( ( v, d ) => ( v + b[ d ] ) / 2 );

		} ),
	} );
	residual.position.set( SUM_X, ( TOK_Y + POS_Y ) / 2, 0 );
	rig.add( residual );
	addPanelFrame( residual, { color: THEME.ink, opacity: 0.34 } );
	labelPanel( residual, 'x — residual stream', `[1, ${ SEQ }, ${ GPT2.dModel }]` );
	labelPanelRows( residual, TOKENS.map( ( t ) => t.display ) );

	residual.userData.detail = {
		category: 'Activation',
		name: 'x = wte[ids] + wpe[pos]',
		blurb: 'The tensor every one of the twelve blocks reads from and writes back into.',
		description: 'Nothing downstream ever replaces this tensor. Each sub-block computes a correction and adds it in, which is why the path from the loss back to the embedding table stays short enough to train through twelve blocks.',
		metric: `[1, ${ SEQ }, ${ GPT2.dModel }]`,
		metricLabel: 'Tensor shape',
	};
	interactables.push( residual );

	const sumPlate = station( SUM_X, ( TOK_Y + POS_Y ) / 2 + 2.05, 'residual stream', 'x = wte[ids] + wpe[pos]' );

	const midY = ( TOK_Y + POS_Y ) / 2;
	conduits.push( new Conduit( wiring[ 3 ],
		[ new THREE.Vector3( TOK_X + tokEmbed.userData.panel.width / 2 + 0.2, TOK_Y, 0 ), new THREE.Vector3( SUM_X - 2.2, TOK_Y - 0.4, 0 ), addNode.position.clone() ],
		THEME.accent, { particleCount: 2, speed: 0.45 } ) );
	conduits.push( new Conduit( wiring[ 3 ],
		[ new THREE.Vector3( POS_X + posEmbed.userData.panel.width / 2 + 0.2, POS_Y, 0 ), new THREE.Vector3( SUM_X - 2.2, POS_Y + 0.4, 0 ), addNode.position.clone() ],
		THEME.signal, { particleCount: 2, speed: 0.45 } ) );
	conduits.push( new Conduit( wiring[ 3 ],
		[ addNode.position.clone(), new THREE.Vector3( SUM_X - 0.9, midY, 0 ), new THREE.Vector3( SUM_X - residual.userData.panel.width / 2 - 0.1, midY, 0 ) ],
		THEME.ink, { particleCount: 2, speed: 0.5 } ) );

	// The stream leaving for block 1 of 12.
	const stream = createStreamBand( { cols: SEQ, segments: 12, axis: 'x', color: THEME.accent, opacity: 0.7 } );
	stream.rotation.z = -Math.PI / 2;
	stream.position.set( STREAM_X, midY, 0 );
	rig.add( stream );

	const streamLabel = createLabel( `→ block 1 of ${ GPT2.nLayer }`, 'label2d label2d-key' );
	streamLabel.position.set( STREAM_X, midY + 0.95, 0 );
	rig.add( streamLabel );

	/* ------------------------------------------------ staging ------------ */

	const STAGES = [
		[ idsGroup, idsPlate ],
		[ idsGroup, wteGroup, tokEmbed, tokPlate ],
		[ wpeGroup, posEmbed, posPlate ],
		[ tokEmbed, posEmbed, addNode, residual, stream, sumPlate, streamLabel ],
	];

	const ALL = [
		idsGroup, idsPlate, wteGroup, tokEmbed, tokPlate,
		wpeGroup, posEmbed, posPlate, addNode, residual, stream, sumPlate, streamLabel,
	];

	let stage = 0;

	function showStage( index ) {

		stage = Math.max( 0, Math.min( STAGES.length - 1, index ) );
		const lit = new Set( STAGES[ stage ] );

		ALL.forEach( ( group ) => setGroupState( group, lit.has( group ) ? 'active' : 'hidden' ) );
		wiring.forEach( ( group, i ) => { group.visible = i === stage; } );
		conduits.forEach( ( c ) => c.setActive( true ) );

		const from = stream.position.x;
		const to = stage === 3 ? STREAM_X : STREAM_X - 0.7;
		tween( 0.5, ( t ) => { stream.position.x = THREE.MathUtils.lerp( from, to, t ); }, { easing: Easing.cubicOut } );

	}

	showStage( 0 );

	let elapsed = 0;

	return {
		scene,
		interactables,
		stageCount: STAGES.length,
		showStage,
		getStepView( index, camera ) {

			return fitView( boundsOf( STAGES[ Math.max( 0, Math.min( STAGES.length - 1, index ) ) ] ), camera );

		},
		update( dt ) {

			elapsed += dt;
			for ( const c of conduits ) c.update( dt );

			// The stream drifts towards block 1 so the page never looks frozen.
			const cells = stream.userData.stream.cells;
			for ( let i = 0; i < cells.length; i ++ ) {

				const mesh = cells[ i ];
				mesh.material.emissiveIntensity = 0.3 + 0.35 * ( 0.5 + 0.5 * Math.sin( elapsed * 2.4 - mesh.userData.segment * 0.5 ) );

			}

		},
	};

}
