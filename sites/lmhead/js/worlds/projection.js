import * as THREE from 'three';
import { addStandardLighting, createDeck, createLabel, THEME, EMISSIVE } from '../utils/sceneKit.js';
import { createStrip, createWall, createFrame, createBar, createRail, paintCell, cellAt } from '../utils/tensorKit.js';
import { VOCAB, D_MODEL, VOCAB_SIZE, hidden, logits, weight } from '../data/lmhead.js';

// The projection z = h · W as an actual matrix–vector product: the hidden
// vector on the left, the weight wall in the middle, the logit rail below.

const VIEWS = [
	{ position: new THREE.Vector3( 0, 1.6, 20 ), target: new THREE.Vector3( 0, -0.6, 0 ) },
	{ position: new THREE.Vector3( 0, 1.0, 15 ), target: new THREE.Vector3( 0, 0.4, 0 ) },
	{ position: new THREE.Vector3( 1.2, 0.6, 13 ), target: new THREE.Vector3( 1.2, -0.6, 0 ) },
	{ position: new THREE.Vector3( 0, 0.4, 17 ), target: new THREE.Vector3( 0, -1.2, 0 ) },
	{ position: new THREE.Vector3( 0, -1.0, 14 ), target: new THREE.Vector3( 0, -2.6, 0 ) },
	{ position: new THREE.Vector3( 0, 2.4, 21 ), target: new THREE.Vector3( 0, -0.5, 0 ) },
];

const SIGN_SCALE = 0.55; // logit → bar height

export function buildProjectionWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene );
	scene.add( createDeck( 70, { y: -5.4, divisions: 70 } ) );

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

	// -- hidden vector ---------------------------------------------------------
	const hStrip = createStrip( { count: D_MODEL, axis: 'y' } );
	hStrip.position.set( -6, 0.6, 0 );
	hStrip.userData.cells.forEach( ( m ) => ( m.userData.kind = 'h' ) );
	rig.add( hStrip );
	label( 'h', 'h · (6,)', 'label2d label2d-key', -6, 2.2 );

	// -- weight wall -----------------------------------------------------------
	const wWall = createWall( { rows: D_MODEL, cols: VOCAB_SIZE } );
	wWall.position.set( 0, 0.6, 0 );
	wWall.userData.cells.forEach( ( m ) => ( m.userData.kind = 'w' ) );
	rig.add( wWall );
	label( 'w', 'W · (6, 16) · one column per word', 'label2d label2d-key', 0, 2.2 );

	// -- logit bars under each column -------------------------------------------
	const logitGroup = new THREE.Group();
	logitGroup.position.set( 0, -2.6, 0 );
	rig.add( logitGroup );

	const zeroLine = createFrame( wWall.userData.width + 0.3, 0.02, { color: THEME.ink, opacity: 0.35 } );
	logitGroup.add( zeroLine );

	const bars = [];
	for ( let j = 0; j < VOCAB_SIZE; j ++ ) {

		const bar = createBar( { width: 0.22, depth: 0.22, color: THEME.signal } );
		bar.position.set( cellAt( wWall, 0, j ).position.x, 0, 0 );
		bar.userData.kind = 'logit';
		bar.userData.vocab = j;
		logitGroup.add( bar );
		bars.push( bar );

	}
	label( 'z', 'z = h·W · (16,)', 'label2d label2d-dim', 0, -3.9 );

	// -- ghost bias strip (the bias that isn't there) ----------------------------
	const bias = createStrip( { count: VOCAB_SIZE, cell: 0.24, gap: 0.15, depth: 0.24 } );
	bias.position.set( 0, -4.6, 0 );
	bias.userData.cells.forEach( ( m ) => {

		m.userData.kind = 'bias';
		m.material.transparent = true;
		m.material.opacity = 0.25;

	} );
	bias.visible = false;
	rig.add( bias );
	label( 'bias', '+ b — usually absent', 'label2d label2d-dim', 0, -5.3 );

	// -- rails from h to the picked column, rebuilt per column -------------------
	const railGroup = new THREE.Group();
	rig.add( railGroup );

	// -- running-sum bar for the dot-product step --------------------------------
	const sumBar = createBar( { width: 0.34, depth: 0.34, color: THEME.accent } );
	sumBar.position.set( 4.6, -2.6, 0 );
	sumBar.visible = false;
	rig.add( sumBar );
	label( 'sum', '', 'label2d label2d-key', 4.6, -3.3 );

	interactables.push( hStrip, wWall, bias, ...bars );

	// -- state -------------------------------------------------------------------
	const h = hidden( 4 );
	const z = logits( h );
	let step = 0;
	let col = 1;
	let sweepK = 0;
	let sweepJ = 0;
	let clock = 0;

	function setSignedBar( bar, value ) {

		const s = value * SIGN_SCALE;
		bar.scale.y = Math.abs( s ) < 0.02 ? ( s < 0 ? -0.02 : 0.02 ) : s;

	}

	function rebuildRails() {

		railGroup.children.forEach( ( r ) => { r.geometry.dispose(); r.material.dispose(); } );
		railGroup.clear();
		if ( step !== 2 ) return;

		for ( let k = 0; k < D_MODEL; k ++ ) {

			const from = new THREE.Vector3(
				hStrip.position.x + 0.2,
				hStrip.position.y + hStrip.userData.cells[ k ].position.y,
				0,
			);
			const cell = cellAt( wWall, k, col );
			const to = new THREE.Vector3( wWall.position.x + cell.position.x, wWall.position.y + cell.position.y, 0 );
			railGroup.add( createRail( from, to, { color: THEME.accent, radius: 0.02, opacity: 0.55 } ) );

		}

	}

	function paintAll() {

		hStrip.userData.cells.forEach( ( m, k ) => {

			const hot = step === 2 && k <= sweepK;
			paintCell( m, hot ? THEME.accent : THEME.signal, 0.35 + Math.abs( h[ k ] ) * 0.6 + ( hot ? 0.2 : 0 ) );

		} );

		wWall.userData.cells.forEach( ( m ) => {

			const isCol = step === 2 && m.userData.col === col;
			const inSweep = step === 3 && m.userData.col <= sweepJ;
			const base = 0.14 + Math.abs( weight( m.userData.row, m.userData.col ) ) * 0.22;
			paintCell( m, isCol || inSweep ? THEME.accent : THEME.info, isCol ? 0.8 : inSweep ? 0.5 : base );

		} );

		bars.forEach( ( bar, j ) => {

			const shown = step >= 3 ? j <= sweepJ || step > 3 : step === 2 && j === col;
			bar.visible = step >= 2;
			setSignedBar( bar, shown ? z[ j ] : 0 );
			bar.material.emissiveIntensity = ( ( step === 2 && j === col ) ? 0.8 : 0.45 ) * EMISSIVE;

		} );

		bias.visible = step === 4;
		sumBar.visible = step === 2;
		labels.sum.visible = step === 2;
		labels.bias.visible = step === 4;
		labels.bias.element.textContent = '+ b — GPT-2 and Llama ship without it';
		labels.z.element.className = 'label2d ' + ( step >= 3 ? 'label2d-key' : 'label2d-dim' );

	}

	return {
		scene,
		interactables,
		getStepView( i ) { return VIEWS[ i ]; },
		setStep( i ) {

			step = i;
			sweepK = 0;
			sweepJ = step > 3 ? VOCAB_SIZE - 1 : 0;
			clock = 0;
			rebuildRails();
			paintAll();

		},
		getState() { return { step, col, h, z }; },
		setColumn( j ) {

			col = j;
			sweepK = 0;
			rebuildRails();
			paintAll();
			return { word: VOCAB[ j ], logit: z[ j ] };

		},
		describe( object ) {

			const u = object.userData;

			if ( u.kind === 'h' ) return {
				category: 'input',
				name: `h[${ u.index }]`,
				blurb: `value ${ h[ u.index ].toFixed( 3 ) }`,
				description: 'One coordinate of the final hidden state. In the dot product it multiplies one row of W — the same row for every word.',
				metricLabel: 'd_model', metric: String( D_MODEL ),
			};

			if ( u.kind === 'w' ) return {
				category: 'weights',
				name: `W[${ u.row }][${ u.col }]`,
				blurb: `column ${ u.col } → "${ VOCAB[ u.col ] }"`,
				description: `Contributes h[${ u.row }] · ${ weight( u.row, u.col ).toFixed( 3 ) } to the logit for "${ VOCAB[ u.col ] }". A column is a word's direction in hidden space.`,
				metricLabel: 'weight', metric: weight( u.row, u.col ).toFixed( 4 ),
			};

			if ( u.kind === 'logit' ) return {
				category: 'output',
				name: `z["${ VOCAB[ u.vocab ] }"]`,
				blurb: `= h · W[:, ${ u.vocab }]`,
				description: 'A raw score, not yet a probability. Bars below the zero line are words the model is actively voting against.',
				metricLabel: 'logit', metric: z[ u.vocab ].toFixed( 3 ),
			};

			if ( u.kind === 'bias' ) return {
				category: 'absent',
				name: 'bias b',
				blurb: 'not in GPT-2, not in Llama',
				description: 'Softmax is shift-invariant, so a per-word constant mostly re-learns word frequency — which the embedding already encodes. Dropping it saves V parameters and nobody misses them.',
				metricLabel: 'value here', metric: '0 (absent)',
			};

			return null;

		},
		update( dt ) {

			if ( step === 2 ) {

				clock += dt;
				if ( clock < 0.5 ) return;
				clock = 0;
				sweepK = ( sweepK + 1 ) % ( D_MODEL + 2 ); // 2 idle beats at the end
				const kShown = Math.min( sweepK, D_MODEL - 1 );
				let partial = 0;
				for ( let k = 0; k <= kShown; k ++ ) partial += h[ k ] * weight( k, col ) * 2.2;
				setSignedBar( sumBar, partial );
				labels.sum.element.textContent = `Σ so far = ${ partial.toFixed( 2 ) }`;
				paintAll();

			} else if ( step === 3 ) {

				clock += dt;
				if ( clock < 0.28 ) return;
				clock = 0;
				sweepJ = ( sweepJ + 1 ) % ( VOCAB_SIZE + 3 ); // idle beats before looping
				paintAll();

			}

		},
	};

}
