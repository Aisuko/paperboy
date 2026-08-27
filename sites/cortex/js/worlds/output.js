import * as THREE from 'three';
import { GPT2 } from '../data/gpt2.js';
import { TOKENS } from '../data/tokens.js';
import { CANDIDATES, VOCAB_SIZE, decode } from '../data/vocab.js';
import { addStandardLighting, createDeck, createLabel, createBarMesh, THEME } from '../utils/sceneKit.js';
import { tween, Easing } from '../utils/tween.js';

// 04 · Output. The half of a decoder-only Transformer that the block pages
// stop short of: what happens to the final hidden state after the last block.
//
// Five stations, left to right, one per operation:
//   0  output embeddings   the residual stream after block 12 + final LayerNorm
//   1  linear layer        h · Wᵀ, tied to the token-embedding matrix
//   2  logits              one raw score per vocabulary entry
//   3  temperature+softmax scores divided by T, then normalised to probabilities
//   4  top-p nucleus       the tail is cut, the survivors are renormalised
//
// Temperature and top-p are live: every bar height, cut plane and readout is
// recomputed from data/vocab.js's `decode()`, so nothing on screen can drift
// away from the arithmetic the console prints.

// Stations are spaced wider than one screen at the page's camera distance, so
// only the station you are looking at is in frame.
const STATION_X = [ -19, -9.5, 0, 9.5, 19 ];
const BAR_SPACING = 0.92;
const BAR_MAX = 2.6;

const ROWS = 12; // rows of the hidden-state strip actually drawn, out of 768

function seeded( i ) {

	const x = Math.sin( i * 12.9898 ) * 43758.5453;
	return ( x - Math.floor( x ) ) * 2 - 1;

}

function cellMaterial( value, color ) {

	const c = new THREE.Color( color ).multiplyScalar( 0.35 + Math.abs( value ) * 0.75 );
	return new THREE.MeshStandardMaterial( {
		color: c, emissive: c, emissiveIntensity: 0.15 + Math.abs( value ) * 0.5,
		roughness: 0.45, metalness: 0.2,
	} );

}

export function buildOutputWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene );
	scene.add( createDeck( 60, { y: -1.9, divisions: 120 } ) );

	const rig = new THREE.Group();
	scene.add( rig );

	const interactables = [];

	function stationLabel( index, title, subtitle ) {

		const head = createLabel( title, 'label2d label2d-key' );
		head.position.set( STATION_X[ index ], 2.9, 0 );
		rig.add( head );

		const sub = createLabel( subtitle, 'label2d label2d-dim' );
		sub.position.set( STATION_X[ index ], 2.55, 0 );
		rig.add( sub );

	}

	/* ---------------------------------------- 0 · output embeddings ------ */

	const embedGroup = new THREE.Group();
	embedGroup.position.x = STATION_X[ 0 ];
	rig.add( embedGroup );

	const embedColumns = [];

	TOKENS.forEach( ( token, t ) => {

		const column = new THREE.Group();
		column.position.x = ( t - ( TOKENS.length - 1 ) / 2 ) * 0.74;
		embedGroup.add( column );

		const isLast = t === TOKENS.length - 1;
		const color = isLast ? THEME.accent : THEME.muted;

		for ( let r = 0; r < ROWS; r ++ ) {

			const value = seeded( t * 31 + r * 7 );
			const cell = new THREE.Mesh( new THREE.BoxGeometry( 0.5, 0.16, 0.5 ), cellMaterial( value, color ) );
			cell.position.y = 1.6 - r * 0.2;
			column.add( cell );

		}

		const label = createLabel( token.display, isLast ? 'label2d label2d-key' : 'label2d label2d-dim' );
		label.position.set( 0, 2.1, 0 );
		column.add( label );

		column.userData.detail = {
			category: 'Output embedding',
			name: `h for "${ token.text.trim() }"`,
			blurb: isLast
				? 'The final hidden state at the last position — the only one the head reads when predicting the next token.'
				: 'A final hidden state for an earlier position. During generation it is computed, kept in the KV cache, and never fed to the head.',
			description: `After all ${ GPT2.nLayer } blocks and the final LayerNorm, every position holds one ${ GPT2.dModel }-dimensional vector. ${ ROWS } of those ${ GPT2.dModel } dimensions are drawn here.`,
			metric: `[1, ${ TOKENS.length }, ${ GPT2.dModel }]`,
			metricLabel: 'Tensor shape',
		};
		interactables.push( column );
		embedColumns.push( column );

	} );

	stationLabel( 0, 'output embeddings', `ln_f(x) · [1, ${ TOKENS.length }, ${ GPT2.dModel }]` );

	const lastColumn = embedColumns[ embedColumns.length - 1 ];

	/* ---------------------------------------- 1 · linear layer ----------- */

	const headGroup = new THREE.Group();
	headGroup.position.x = STATION_X[ 1 ];
	rig.add( headGroup );

	// The weight matrix, drawn as a tall wall of cells: 768 wide, 50,257 tall.
	const matrix = new THREE.Group();
	headGroup.add( matrix );

	const MAT_COLS = 10;
	const MAT_ROWS = 13;
	const MAT_STEP = 0.24;

	for ( let c = 0; c < MAT_COLS; c ++ ) {

		for ( let r = 0; r < MAT_ROWS; r ++ ) {

			const value = seeded( c * 17 + r * 5 + 3 );
			const cell = new THREE.Mesh( new THREE.BoxGeometry( 0.2, 0.2, 0.07 ), cellMaterial( value, THEME.violet ) );
			cell.position.set( ( c - ( MAT_COLS - 1 ) / 2 ) * MAT_STEP, ( ( MAT_ROWS - 1 ) / 2 - r ) * MAT_STEP + 0.3, 0 );
			matrix.add( cell );

		}

	}

	matrix.userData.detail = {
		category: 'Linear layer (lm_head)',
		name: 'logits = h · Wᵀ',
		blurb: `A single matrix multiply from ${ GPT2.dModel } dimensions to ${ VOCAB_SIZE.toLocaleString( 'en-AU' ) } scores.`,
		description: 'GPT-2 ties this weight to the input token-embedding matrix, so the head is literally wte transposed. A token scores highly exactly when the final hidden state points along that token\'s embedding row — prediction is a dot product against every word the model knows.',
		metric: `[${ GPT2.dModel } × ${ VOCAB_SIZE.toLocaleString( 'en-AU' ) }]`,
		metricLabel: 'Weight shape',
	};
	interactables.push( matrix );

	stationLabel( 1, 'linear layer · lm_head', `Wᵀ [${ GPT2.dModel } → ${ VOCAB_SIZE.toLocaleString( 'en-AU' ) }] · tied to wte` );

	// Beam from the last hidden state into the matrix — the only input the head
	// gets, made visually explicit.
	const beamCurve = new THREE.CatmullRomCurve3( [
		new THREE.Vector3( STATION_X[ 0 ] + lastColumn.position.x + 0.4, 0.4, 0 ),
		new THREE.Vector3( ( STATION_X[ 0 ] + STATION_X[ 1 ] ) / 2, 1.2, 0 ),
		new THREE.Vector3( STATION_X[ 1 ] - 1.5, 0.4, 0 ),
	] );
	const beam = new THREE.Mesh(
		new THREE.TubeGeometry( beamCurve, 32, 0.035, 8, false ),
		new THREE.MeshBasicMaterial( { color: THEME.accent, transparent: true, opacity: 0.4 } ),
	);
	rig.add( beam );

	const beamPacket = new THREE.Mesh(
		new THREE.SphereGeometry( 0.09, 12, 12 ),
		new THREE.MeshBasicMaterial( { color: THEME.accent } ),
	);
	rig.add( beamPacket );

	/* ---------------------------------------- shared bar builder --------- */

	function buildBars( x, color, { showTail = false } = {} ) {

		const group = new THREE.Group();
		group.position.x = x;
		rig.add( group );

		const bars = CANDIDATES.map( ( candidate, i ) => {

			const bar = createBarMesh( { width: 0.5, depth: 0.5, height: BAR_MAX, color } );
			bar.position.set( ( i - ( CANDIDATES.length - 1 ) / 2 ) * BAR_SPACING, -1.5, 0 );
			bar.scale.y = 0.001;
			bar.material.transparent = true;
			group.add( bar );

			const name = createLabel( candidate.display, 'label2d label2d-dim' );
			name.position.set( 0, -0.3, 0 );
			bar.add( name );

			const value = createLabel( '', 'label2d' );
			value.position.set( 0, BAR_MAX + 0.35, 0 );
			bar.add( value );

			return { mesh: bar, valueLabel: value, candidate, index: i };

		} );

		if ( showTail ) {

			const tail = new THREE.Mesh(
				new THREE.BoxGeometry( CANDIDATES.length * BAR_SPACING, 0.12, 0.5 ),
				new THREE.MeshStandardMaterial( { color: THEME.muted, emissive: THEME.muted, emissiveIntensity: 0.25, transparent: true, opacity: 0.5 } ),
			);
			tail.position.set( 0, -1.44, -0.9 );
			group.add( tail );

			const tailLabel = createLabel( `+ ${ ( VOCAB_SIZE - CANDIDATES.length ).toLocaleString( 'en-AU' ) } more, all lower`, 'label2d label2d-dim' );
			tailLabel.position.set( 0, 0.2, 0 );
			tail.add( tailLabel );

		}

		return { group, bars };

	}

	/* ---------------------------------------- 2 · logits ----------------- */

	const logitStation = buildBars( STATION_X[ 2 ], THEME.signal, { showTail: true } );
	stationLabel( 2, 'logits', `one raw score per vocabulary entry` );

	logitStation.bars.forEach( ( bar ) => {

		bar.mesh.userData.detail = {
			category: 'Logit',
			name: `"${ bar.candidate.token }"  (id ${ bar.candidate.id })`,
			blurb: `Raw score ${ bar.candidate.logit.toFixed( 2 ) } before any normalisation.`,
			description: 'A logit is unbounded and has no meaning on its own — only its size relative to the other 50,256 matters. Adding a constant to every logit changes nothing after softmax.',
			metric: bar.candidate.logit.toFixed( 2 ),
			metricLabel: 'Logit',
		};
		interactables.push( bar.mesh );

	} );

	/* ---------------------------------------- 3 · temperature + softmax -- */

	const softmaxStation = buildBars( STATION_X[ 3 ], THEME.accent );
	stationLabel( 3, 'temperature → softmax', 'p = softmax(z / T)' );

	// A dial whose arc length shows the current temperature.
	const dialTrack = new THREE.Mesh(
		new THREE.TorusGeometry( 0.7, 0.018, 8, 64, Math.PI * 1.5 ),
		new THREE.MeshBasicMaterial( { color: THEME.muted, transparent: true, opacity: 0.6 } ),
	);
	dialTrack.rotation.z = Math.PI * 0.75;
	dialTrack.position.set( STATION_X[ 3 ] + 2.9, 0.9, -1.0 );
	rig.add( dialTrack );

	let dialArc = null;
	const dialLabel = createLabel( 'T = 1.00', 'label2d label2d-key' );
	dialLabel.position.set( STATION_X[ 3 ] + 2.9, 0.9, -1.0 );
	rig.add( dialLabel );

	function setDial( temperature ) {

		if ( dialArc ) { dialArc.geometry.dispose(); rig.remove( dialArc ); }
		// Dial sweeps over the slider's own range, 0.1 – 2.0.
		const fraction = THREE.MathUtils.clamp( ( temperature - 0.1 ) / 1.9, 0.02, 1 );
		dialArc = new THREE.Mesh(
			new THREE.TorusGeometry( 0.7, 0.05, 10, 64, Math.PI * 1.5 * fraction ),
			new THREE.MeshBasicMaterial( { color: temperature > 1 ? THEME.signal : THEME.accent } ),
		);
		dialArc.rotation.z = Math.PI * 0.75;
		dialArc.position.copy( dialTrack.position );
		rig.add( dialArc );
		dialLabel.element.textContent = `T = ${ temperature.toFixed( 2 ) }`;

	}

	softmaxStation.bars.forEach( ( bar ) => {

		bar.mesh.userData.detail = {
			category: 'Softmax probability',
			name: `"${ bar.candidate.token }"`,
			blurb: 'Probability after temperature scaling and softmax over the shown candidates.',
			description: 'Softmax exponentiates every logit and divides by the sum, so the outputs are positive and total 1. Temperature divides the logits first: below 1 it sharpens the distribution, above 1 it flattens it. The ranking never changes.',
		};
		interactables.push( bar.mesh );

	} );

	/* ---------------------------------------- 4 · top-p nucleus ---------- */

	const nucleusStation = buildBars( STATION_X[ 4 ], THEME.accent );
	stationLabel( 4, 'top-p nucleus', 'cut the tail, renormalise the rest' );

	// A plane marking where the cumulative probability crosses p; bars behind it
	// are in the nucleus, bars beyond it are discarded.
	const cutPlane = new THREE.Mesh(
		new THREE.BoxGeometry( 0.05, 4.0, 1.4 ),
		new THREE.MeshBasicMaterial( { color: THEME.signal, transparent: true, opacity: 0.55 } ),
	);
	cutPlane.position.set( STATION_X[ 4 ], 0.4, 0 );
	rig.add( cutPlane );

	const cutLabel = createLabel( 'nucleus cut', 'label2d label2d-dim' );
	cutLabel.position.set( STATION_X[ 4 ], 2.15, 0 );
	rig.add( cutLabel );

	nucleusStation.bars.forEach( ( bar ) => {

		bar.mesh.userData.detail = {
			category: 'Nucleus candidate',
			name: `"${ bar.candidate.token }"`,
			blurb: 'Probability after the tail beyond p is dropped and the survivors are renormalised.',
			description: 'Top-p adapts to how confident the model is: at a confident step the nucleus can be a single token, at an uncertain one it can be dozens. Top-k, by contrast, always keeps exactly k regardless of the shape of the distribution.',
		};
		interactables.push( bar.mesh );

	} );

	/* ---------------------------------------- live update ---------------- */

	let params = { temperature: 1.0, topP: 0.9 };
	let result = decode( params );

	function applyBars( station, values, { dimMask = null, format } ) {

		station.bars.forEach( ( bar, i ) => {

			const target = Math.max( 0.004, values[ i ] );
			const from = bar.mesh.scale.y;
			tween( 0.45, ( t ) => { bar.mesh.scale.y = THREE.MathUtils.lerp( from, target, t ); }, { easing: Easing.cubicOut } );

			const dimmed = dimMask ? ! dimMask[ i ] : false;
			bar.mesh.material.opacity = dimmed ? 0.22 : 1;
			bar.mesh.material.emissiveIntensity = dimmed ? 0.1 : 0.55;
			bar.valueLabel.element.textContent = format( i );
			bar.valueLabel.element.style.opacity = dimmed ? '0.35' : '1';

		} );

	}

	function refresh() {

		result = decode( params );

		// Logits are drawn on a shared scale so the bars stay comparable; the
		// smallest candidate still gets a visible stub.
		const maxLogit = Math.max( ...CANDIDATES.map( ( c ) => c.logit ) );
		applyBars( logitStation, CANDIDATES.map( ( c ) => ( c.logit / maxLogit ) * 0.9 ), {
			format: ( i ) => CANDIDATES[ i ].logit.toFixed( 2 ),
		} );

		applyBars( softmaxStation, result.rows.map( ( r ) => r.prob ), {
			format: ( i ) => `${ ( result.rows[ i ].prob * 100 ).toFixed( 1 ) }%`,
		} );

		applyBars( nucleusStation, result.rows.map( ( r ) => r.sampleProb ), {
			dimMask: result.rows.map( ( r ) => r.kept ),
			format: ( i ) => ( result.rows[ i ].kept ? `${ ( result.rows[ i ].sampleProb * 100 ).toFixed( 1 ) }%` : 'dropped' ),
		} );

		setDial( params.temperature );

		// Park the cut plane just past the last kept bar.
		const keptCount = result.keptCount;
		const cutX = ( keptCount - 1 - ( CANDIDATES.length - 1 ) / 2 ) * BAR_SPACING + BAR_SPACING / 2;
		const fromX = cutPlane.position.x;
		const toX = STATION_X[ 4 ] + cutX;
		tween( 0.4, ( t ) => {

			cutPlane.position.x = THREE.MathUtils.lerp( fromX, toX, t );
			cutLabel.position.x = cutPlane.position.x;

		}, { easing: Easing.cubicOut } );

		cutLabel.element.textContent = `p = ${ params.topP.toFixed( 2 ) } · ${ keptCount } kept`;

		return result;

	}

	refresh();

	const STATION_VIEWS = STATION_X.map( ( x ) => ( {
		position: new THREE.Vector3( x - 0.4, 2.4, 13.5 ),
		target: new THREE.Vector3( x - 0.4, 0.55, 0 ),
	} ) );

	let elapsed = 0;

	return {
		scene,
		interactables,
		stationCount: STATION_X.length,
		defaultView: STATION_VIEWS[ 0 ],
		getStepView( index ) {

			return STATION_VIEWS[ Math.max( 0, Math.min( STATION_VIEWS.length - 1, index ) ) ];

		},
		setParams( next ) {

			params = { ...params, ...next };
			return refresh();

		},
		getResult() { return result; },
		update( dt ) {

			elapsed += dt;
			beamCurve.getPointAt( ( elapsed * 0.35 ) % 1, beamPacket.position );
			embedColumns.forEach( ( column, i ) => {

				const lift = i === embedColumns.length - 1 ? Math.sin( elapsed * 1.8 ) * 0.03 : 0;
				column.position.y = lift;

			} );

		},
	};

}
