import * as THREE from 'three';
import { addStandardLighting, createDeck, createLabel, THEME, EMISSIVE } from '../utils/sceneKit.js';
import { createStrip, createFrame, createBar, paintCell } from '../utils/tensorKit.js';
import { VOCAB, VOCAB_SIZE, hidden, logits, softmax, entropy, topK, argmax, sampleFrom } from '../data/lmhead.js';

// One bar per vocabulary word. The scrubber replays the softmax pipeline on
// the same sixteen logits: raw → shifted → exponentiated → normalised →
// temperature → sampling.

const VIEWS = [
	{ position: new THREE.Vector3( 0, 0.8, 15 ), target: new THREE.Vector3( 0, -1.0, 0 ) },
	{ position: new THREE.Vector3( 0, 0.2, 14 ), target: new THREE.Vector3( 0, -1.6, 0 ) },
	{ position: new THREE.Vector3( 0, 0.8, 14 ), target: new THREE.Vector3( 0, -0.9, 0 ) },
	{ position: new THREE.Vector3( 0, 1.2, 14 ), target: new THREE.Vector3( 0, -0.6, 0 ) },
	{ position: new THREE.Vector3( 0, 1.0, 13 ), target: new THREE.Vector3( 0, -0.7, 0 ) },
	{ position: new THREE.Vector3( 0, 1.4, 15 ), target: new THREE.Vector3( 0, -0.7, 0 ) },
];

export function buildSoftmaxWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene );
	scene.add( createDeck( 60, { y: -4.8, divisions: 60 } ) );

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

	// -- vocab strip with a word label per cell -----------------------------
	const strip = createStrip( { count: VOCAB_SIZE, cell: 0.3, gap: 0.28, depth: 0.3 } );
	strip.position.set( 0, -2.4, 0 );
	strip.userData.cells.forEach( ( m, j ) => {

		m.userData.kind = 'word';
		m.userData.vocab = j;
		const l = createLabel( VOCAB[ j ], 'label2d label2d-dim' );
		l.position.set( strip.userData.cells[ j ].position.x, -0.55, 0 );
		strip.add( l );

	} );
	rig.add( strip );

	// zero line the signed bars hang from
	const zeroLine = createFrame( strip.userData.length + 0.4, 0.02, { color: THEME.ink, opacity: 0.4 } );
	zeroLine.position.set( 0, -1.2, 0 );
	rig.add( zeroLine );

	const bars = [];
	for ( let j = 0; j < VOCAB_SIZE; j ++ ) {

		const bar = createBar( { width: 0.24, depth: 0.24, color: THEME.accent } );
		// Slightly behind the strip so negative bars never cover the word labels.
		bar.position.set( strip.userData.cells[ j ].position.x, -1.2, -0.45 );
		bar.userData.kind = 'bar';
		bar.userData.vocab = j;
		rig.add( bar );
		bars.push( bar );

	}

	label( 'stage', 'raw logits z', 'label2d label2d-key', 0, 2.6 );
	label( 'sum', '', 'label2d label2d-dim', 5.6, 1.6 );
	label( 'pick', '', 'label2d label2d-key', 0, 3.4 );

	interactables.push( strip, ...bars );

	// -- state ----------------------------------------------------------------
	const h = hidden( 4 );
	const z = logits( h );
	const zMax = Math.max( ...z );
	let step = 0;
	let T = 1;
	let mode = 'greedy';
	let chosen = -1;
	let draws = 0;
	let flash = 0;

	const tempOn = () => step >= 4;
	const probs = () => softmax( z, tempOn() ? T : 1 );

	// What each step draws, per word: [value, signed?]
	function displayed( j ) {

		if ( step === 0 ) return [ z[ j ] * 0.5, true ];
		if ( step === 1 ) return [ ( z[ j ] - zMax ) * 0.5, true ];
		if ( step === 2 ) return [ Math.exp( z[ j ] - zMax ) * 2.4, false ];
		return [ probs()[ j ] * 8, false ];

	}

	function stageText() {

		if ( step === 0 ) return 'raw logits z';
		if ( step === 1 ) return 'z − max(z) · biggest sits at 0';
		if ( step === 2 ) return 'exp(z − max) · all positive';
		if ( step === 3 ) return 'p = exp / Σ exp · Σ p = 1';
		if ( step === 4 ) return `p = softmax(z / T) · T = ${ T.toFixed( 2 ) }`;
		return `sampling · ${ mode }`;

	}

	function paintAll() {

		const p = probs();
		const best = argmax( p );
		const survivors = new Set( topK( p, 5 ).map( ( e ) => e.j ) );

		bars.forEach( ( bar, j ) => {

			const [ v ] = displayed( j );
			bar.scale.y = Math.abs( v ) < 0.02 ? ( v < 0 ? -0.02 : 0.02 ) : v;

			let color = THEME.accent;
			let glow = 0.45;

			if ( step === 5 ) {

				if ( mode === 'greedy' ) { color = j === best ? THEME.signal : THEME.muted; glow = j === best ? 0.9 : 0.25; }
				else if ( mode === 'top-k' ) { color = survivors.has( j ) ? THEME.accent : THEME.muted; glow = survivors.has( j ) ? 0.6 : 0.15; }
				if ( j === chosen ) { color = THEME.signal; glow = 1.0; }

			} else if ( step >= 3 && j === best ) {

				color = THEME.signal; glow = 0.7;

			} else if ( step <= 1 && v < 0 ) {

				// Words the model is voting against hang below the zero line.
				color = THEME.info;

			}

			bar.material.color.set( color );
			bar.material.emissive.set( color );
			bar.material.emissiveIntensity = glow * EMISSIVE;

		} );

		strip.userData.cells.forEach( ( m, j ) => paintCell( m, THEME.muted, step === 5 && j === chosen ? 0.8 : 0.25 ) );

		labels.stage.element.textContent = stageText();
		labels.sum.visible = step >= 2;
		labels.sum.element.textContent =
			step === 2 ? `Σ = ${ z.reduce( ( a, v ) => a + Math.exp( v - zMax ), 0 ).toFixed( 2 ) }` : 'Σ p = 1.000';
		labels.pick.visible = step === 5 && chosen >= 0;

	}

	return {
		scene,
		interactables,
		getStepView( i ) { return VIEWS[ i ]; },
		setStep( i ) { step = i; flash = 0; paintAll(); },
		getState() { return { step, T: tempOn() ? T : 1, mode, chosen, z, p: probs(), h }; },
		setTemperature( t ) { T = t; paintAll(); return probs(); },
		setSampling( m ) { mode = m; chosen = -1; paintAll(); },
		sample() {

			const p = probs();
			draws ++;

			if ( mode === 'greedy' ) chosen = argmax( p );
			else {

				let pool = p;
				if ( mode === 'top-k' ) {

					const keep = new Set( topK( p, 5 ).map( ( e ) => e.j ) );
					const masked = p.map( ( v, j ) => ( keep.has( j ) ? v : 0 ) );
					const s = masked.reduce( ( a, b ) => a + b, 0 );
					pool = masked.map( ( v ) => v / s );

				}
				// Deterministic low-discrepancy draw so replays are reproducible.
				chosen = sampleFrom( pool, ( draws * 0.6180339887 + 0.31 ) % 1 );

			}

			flash = 1;
			labels.pick.element.textContent = `→ "${ VOCAB[ chosen ] }"  (p = ${ ( p[ chosen ] * 100 ).toFixed( 1 ) }%)`;
			paintAll();
			return { j: chosen, word: VOCAB[ chosen ], p: p[ chosen ] };

		},
		describe( object ) {

			const u = object.userData;
			if ( u.kind !== 'bar' && u.kind !== 'word' ) return null;

			const j = u.vocab;
			const p = probs();
			return {
				category: 'vocabulary',
				name: `"${ VOCAB[ j ] }"`,
				blurb: `logit ${ z[ j ].toFixed( 2 ) } → p ${ ( p[ j ] * 100 ).toFixed( 1 ) }%`,
				description: `exp((z − max) / T) / Σ. Right now T = ${ ( tempOn() ? T : 1 ).toFixed( 2 ) }, entropy of the whole distribution = ${ entropy( p ).toFixed( 2 ) } bits.`,
				metricLabel: 'probability', metric: ( p[ j ] * 100 ).toFixed( 2 ) + '%',
			};

		},
		update( dt ) {

			if ( step === 5 && chosen >= 0 && flash > 0 ) {

				flash = Math.max( 0, flash - dt * 1.4 );
				const bar = bars[ chosen ];
				bar.material.emissiveIntensity = ( 0.7 + 0.6 * Math.sin( flash * Math.PI * 4 ) ) * EMISSIVE;

			}

		},
	};

}
