import * as THREE from 'three';
import { addStandardLighting, createDeck, createLabel, THEME, EMISSIVE } from '../utils/sceneKit.js';
import { createStrip, createWall, createFrame, createBar, setBar, createRail, paintCell } from '../utils/tensorKit.js';
import { VOCAB, PROMPT, N_BLOCKS, D_MODEL, VOCAB_SIZE, hidden, logits, softmax, weight } from '../data/lmhead.js';

// Layout, left to right: tokens → embedding → 4 blocks → final hidden state
// ‖ divider ‖ → LM head W → softmax bars over the vocabulary.

const VIEWS = [
	{ position: new THREE.Vector3( 1.5, 2.6, 28 ), target: new THREE.Vector3( 1.5, 0.1, 0 ) },
	{ position: new THREE.Vector3( -8.6, 1.6, 10 ), target: new THREE.Vector3( -8.6, 0.3, 0 ) },
	{ position: new THREE.Vector3( -2.4, 2.2, 11 ), target: new THREE.Vector3( -2.4, 0.3, 0 ) },
	{ position: new THREE.Vector3( 1.6, 1.2, 7 ), target: new THREE.Vector3( 1.6, 0.4, 0 ) },
	{ position: new THREE.Vector3( 6.2, 1.2, 10 ), target: new THREE.Vector3( 6.2, 0.2, 0 ) },
	{ position: new THREE.Vector3( 8.6, 2.2, 17 ), target: new THREE.Vector3( 8.6, 0.4, 0 ) },
];

const OVERVIEW = { position: new THREE.Vector3( 1.8, 3.2, 31 ), target: new THREE.Vector3( 1.8, 0.1, 0 ) };

export function buildHeadWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene );
	scene.add( createDeck( 80, { y: -4.6, divisions: 80 } ) );

	const rig = new THREE.Group();
	scene.add( rig );

	const interactables = [];
	const labels = {};

	const label = ( key, text, cls, x, y, z = 0 ) => {

		const l = createLabel( text, cls );
		l.position.set( x, y, z );
		rig.add( l );
		labels[ key ] = l;
		return l;

	};

	// -- tokens ------------------------------------------------------------
	const tokens = createStrip( { count: PROMPT.length, cell: 0.44, gap: 0.42, depth: 0.44 } );
	tokens.position.set( -11, 0.4, 0 );
	tokens.userData.cells.forEach( ( m, i ) => { m.userData.kind = 'token'; m.userData.pos = i; } );
	rig.add( tokens );
	PROMPT.forEach( ( word, i ) => label( `tok${ i }`, `"${ word }"`, 'label2d label2d-dim', -11 + tokens.userData.cells[ i ].position.x, -0.45 ) );
	label( 'tokens', '5 tokens', 'label2d label2d-dim', -11, 1.3 );

	// -- embedding (T × d) ---------------------------------------------------
	const emb = createWall( { rows: PROMPT.length, cols: D_MODEL } );
	emb.position.set( -7.4, 0.4, 0 );
	emb.userData.cells.forEach( ( m ) => ( m.userData.kind = 'emb' ) );
	rig.add( emb );
	label( 'emb', 'embedding · (5, 6)', 'label2d label2d-dim', -7.4, 1.9 );

	// -- transformer blocks --------------------------------------------------
	const blocks = [];
	for ( let b = 0; b < N_BLOCKS; b ++ ) {

		const x = -4.2 + b * 1.2;
		const shell = new THREE.Mesh(
			new THREE.BoxGeometry( 0.72, 2.5, 1.7 ),
			new THREE.MeshStandardMaterial( {
				color: THEME.violet, emissive: THEME.violet, emissiveIntensity: 0.12 * EMISSIVE,
				transparent: true, opacity: 0.42, roughness: 0.35, metalness: 0.3,
			} ),
		);
		shell.position.set( x, 0.4, 0 );
		shell.userData.kind = 'block';
		shell.userData.block = b;
		rig.add( shell );

		const edges = new THREE.LineSegments(
			new THREE.EdgesGeometry( new THREE.BoxGeometry( 0.72, 2.5, 1.7 ) ),
			new THREE.LineBasicMaterial( { color: THEME.violet, transparent: true, opacity: 0.5 } ),
		);
		edges.position.copy( shell.position );
		rig.add( edges );

		blocks.push( shell );
		interactables.push( shell );

	}
	label( 'blocks', `${ N_BLOCKS } transformer blocks`, 'label2d label2d-dim', -2.4, 2.2 );
	label( 'backbone', 'the backbone', 'label2d label2d-key', -4.6, 3.2 );

	// residual rail threading the blocks
	const rail = createRail(
		new THREE.Vector3( -6.1, 0.4, 0 ),
		new THREE.Vector3( 1.6, 0.4, 0 ),
		{ color: THEME.info, radius: 0.05, opacity: 0.55 },
	);
	rig.add( rail );

	const pulse = new THREE.Mesh(
		new THREE.SphereGeometry( 0.14, 12, 12 ),
		new THREE.MeshStandardMaterial( { color: THEME.info, emissive: THEME.info, emissiveIntensity: 1.2 * EMISSIVE } ),
	);
	pulse.position.set( -6.1, 0.4, 0 );
	pulse.visible = false;
	rig.add( pulse );

	// -- final hidden state --------------------------------------------------
	const hiddenStrip = createStrip( { count: D_MODEL, axis: 'y' } );
	hiddenStrip.position.set( 1.6, 0.4, 0 );
	hiddenStrip.userData.cells.forEach( ( m ) => ( m.userData.kind = 'hidden' ) );
	rig.add( hiddenStrip );
	label( 'hidden', 'h · (6,)', 'label2d label2d-dim', 1.6, 2.0 );

	// -- divider: backbone | head -------------------------------------------
	const divider = createFrame( 0.02, 5.4, { color: THEME.signal, opacity: 0.5 } );
	divider.position.set( 3.0, 0.6, 0 );
	rig.add( divider );
	label( 'divider', 'backbone | head', 'label2d label2d-key', 3.0, 3.5 );

	// -- LM head weight matrix (d × V) ---------------------------------------
	const wWall = createWall( { rows: D_MODEL, cols: VOCAB_SIZE } );
	wWall.position.set( 6.2, 0.4, 0 );
	wWall.userData.cells.forEach( ( m ) => ( m.userData.kind = 'w' ) );
	rig.add( wWall );
	label( 'w', 'LM head · W · (6, 16)', 'label2d label2d-dim', 6.2, 2.0 );

	// rail hidden → head
	const headRail = createRail(
		new THREE.Vector3( 1.85, 0.4, 0 ),
		new THREE.Vector3( 4.9, 0.4, 0 ),
		{ color: THEME.accent, radius: 0.04, opacity: 0.5 },
	);
	rig.add( headRail );

	// -- softmax bars over the vocabulary ------------------------------------
	const barsGroup = new THREE.Group();
	barsGroup.position.set( 12.0, -0.8, 0 );
	rig.add( barsGroup );

	const vocabStrip = createStrip( { count: VOCAB_SIZE, cell: 0.28, gap: 0.08, depth: 0.28 } );
	vocabStrip.userData.cells.forEach( ( m, j ) => { m.userData.kind = 'prob'; m.userData.vocab = j; } );
	barsGroup.add( vocabStrip );

	const bars = [];
	for ( let j = 0; j < VOCAB_SIZE; j ++ ) {

		const bar = createBar( { width: 0.22, depth: 0.22, color: THEME.accent } );
		bar.position.set( vocabStrip.userData.cells[ j ].position.x, 0.2, 0 );
		bar.userData.kind = 'prob';
		bar.userData.vocab = j;
		barsGroup.add( bar );
		bars.push( bar );

	}
	label( 'probs', 'p = softmax(z) · (16,)', 'label2d label2d-dim', 12.0, 2.4 );
	label( 'sum', '', 'label2d label2d-key', 12.0, -1.6 );

	interactables.push( tokens, emb, hiddenStrip, wWall, vocabStrip, ...bars );

	// -- state ---------------------------------------------------------------
	let step = 0;
	let pos = PROMPT.length - 1;
	let h = hidden( pos );
	let z = logits( h );
	let p = softmax( z );
	let pulseT = 0;

	function paintAll() {

		const on = ( s ) => step >= s;

		tokens.userData.cells.forEach( ( m ) => paintCell( m, THEME.info, on( 1 ) ? 0.55 : 0.2 ) );
		emb.userData.cells.forEach( ( m ) => {

			const lit = on( 1 ) ? ( m.userData.row === pos && on( 3 ) ? 0.75 : 0.4 ) : 0.14;
			paintCell( m, THEME.info, lit );

		} );

		blocks.forEach( ( shell ) => {

			shell.material.emissiveIntensity = ( on( 2 ) ? 0.4 : 0.12 ) * EMISSIVE;
			shell.material.opacity = on( 2 ) ? 0.55 : 0.42;

		} );

		hiddenStrip.userData.cells.forEach( ( m, k ) => {

			const level = on( 3 ) ? 0.35 + Math.abs( h[ k ] ) * 0.7 : 0.15;
			paintCell( m, THEME.signal, level );

		} );

		wWall.userData.cells.forEach( ( m ) => paintCell( m, THEME.accent, on( 4 ) ? 0.45 : 0.14 ) );

		const showBars = on( 5 );
		bars.forEach( ( bar, j ) => {

			setBar( bar, showBars ? 0.2 + p[ j ] * 6 : 0.001 );
			bar.visible = showBars;

		} );
		vocabStrip.userData.cells.forEach( ( m ) => paintCell( m, THEME.muted, showBars ? 0.35 : 0.1 ) );
		labels.sum.visible = showBars;
		labels.sum.element.textContent = 'Σ p = 1.000';
		labels.probs.element.className = 'label2d ' + ( showBars ? 'label2d-key' : 'label2d-dim' );
		labels.w.element.className = 'label2d ' + ( on( 4 ) ? 'label2d-key' : 'label2d-dim' );
		labels.hidden.element.className = 'label2d ' + ( on( 3 ) ? 'label2d-key' : 'label2d-dim' );
		labels.emb.element.className = 'label2d ' + ( step === 1 ? 'label2d-key' : 'label2d-dim' );
		labels.blocks.element.className = 'label2d ' + ( step === 2 ? 'label2d-key' : 'label2d-dim' );

		pulse.visible = on( 2 );

	}

	function recompute() {

		h = hidden( pos );
		z = logits( h );
		p = softmax( z );

	}

	return {
		scene,
		interactables,
		getStepView( i ) { return VIEWS[ i ]; },
		getOverview() { return OVERVIEW; },
		setStep( i ) { step = i; paintAll(); },
		getState() { return { step, pos, h, z, p }; },
		setPos( t ) {

			pos = t;
			recompute();
			paintAll();
			return { h, z, p };

		},
		describe( object ) {

			const u = object.userData;

			if ( u.kind === 'token' ) return {
				category: 'input',
				name: `token "${ PROMPT[ u.pos ] }"`,
				blurb: `position ${ u.pos } of 5`,
				description: 'A token id — just an integer index into the vocabulary. The embedding table turns it into the vector the backbone actually works on.',
				metricLabel: 'vocab id', metric: String( VOCAB.indexOf( PROMPT[ u.pos ] ) ),
			};

			if ( u.kind === 'emb' ) return {
				category: 'backbone',
				name: `E["${ PROMPT[ u.row ] }"][${ u.col }]`,
				blurb: 'embedding · shape (5, 6)',
				description: 'One entry of a token\'s embedding vector. The full table is vocab × d_model — the mirror image of the LM head, which is why the two are often tied.',
				metricLabel: 'shape', metric: '(V, d) = (16, 6)',
			};

			if ( u.kind === 'block' ) return {
				category: 'backbone',
				name: `transformer block ${ u.block + 1 }`,
				blurb: 'attention + MLP + residual',
				description: 'Reads every position, writes a correction onto the residual stream. All the nonlinear "understanding" happens in these; the head after them can stay linear.',
				metricLabel: 'blocks here / GPT-2 / Llama-3 70B', metric: '4 / 12 / 80',
			};

			if ( u.kind === 'hidden' ) return {
				category: 'interface',
				name: `h[${ u.index }]`,
				blurb: 'final hidden state · (6,)',
				description: `The whole prompt, compressed into d_model numbers at the last position. Current value at index ${ u.index }: ${ h[ u.index ].toFixed( 3 ) }. This vector is the only input the LM head gets.`,
				metricLabel: 'd_model', metric: String( D_MODEL ),
			};

			if ( u.kind === 'w' ) return {
				category: 'LM head',
				name: `W[${ u.row }][${ u.col }]`,
				blurb: `column ${ u.col } scores "${ VOCAB[ u.col ] }"`,
				description: `Each column of W is a direction in hidden space belonging to one word. The logit for "${ VOCAB[ u.col ] }" is the dot product of h with column ${ u.col }.`,
				metricLabel: 'weight', metric: weight( u.row, u.col ).toFixed( 3 ),
			};

			if ( u.kind === 'prob' ) return {
				category: 'output',
				name: `p("${ VOCAB[ u.vocab ] }")`,
				blurb: `logit ${ z[ u.vocab ].toFixed( 2 ) } → prob ${ ( p[ u.vocab ] * 100 ).toFixed( 1 ) }%`,
				description: 'One entry of the output distribution: the model\'s probability that this word comes next. All sixteen sum to exactly one.',
				metricLabel: 'probability', metric: ( p[ u.vocab ] * 100 ).toFixed( 2 ) + '%',
			};

			return null;

		},
		update( dt ) {

			if ( ! pulse.visible ) return;
			pulseT = ( pulseT + dt * 0.35 ) % 1;
			pulse.position.x = -6.1 + pulseT * 7.7;
			pulse.material.emissiveIntensity = ( 0.8 + 0.5 * Math.sin( pulseT * Math.PI ) ) * EMISSIVE;

		},
	};

}
