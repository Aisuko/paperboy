import * as THREE from 'three';
import { addStandardLighting, createDeck, createLabel, THEME } from '../utils/sceneKit.js';
import { createStrip, createWall, createBar, setBar, tintBar, paintCell, createLinks } from '../utils/tensorKit.js';
import { AGENTS, EMB, TOKENS, SHOWN, ORCH, argmax } from '../data/model.js';

const ROWS = TOKENS.length + 1;
const PITCH = 0.23;
const BAR_X = -1.95;
const rowY = ( i ) => ( 4 - i ) * PITCH;
const short = ( v ) => ( v < TOKENS.length ? TOKENS[ v ].trim() : 'tail' );

const VIEWS = [
	{ position: new THREE.Vector3( -4.5, 1.4, 7.2 ), target: new THREE.Vector3( -4.3, 0, 0 ) },
	{ position: new THREE.Vector3( -3.3, 1.6, 9.0 ), target: new THREE.Vector3( -3.2, 0, 0 ) },
	{ position: new THREE.Vector3( -0.8, 1.2, 10.0 ), target: new THREE.Vector3( -0.9, 0, 0 ) },
	{ position: new THREE.Vector3( -0.8, 1.2, 8.4 ), target: new THREE.Vector3( -0.9, 0, 0 ) },
	{ position: new THREE.Vector3( 0.7, 1.4, 9.4 ), target: new THREE.Vector3( 0.2, 0, 0 ) },
	{ position: new THREE.Vector3( -0.6, 3.6, 14.5 ), target: new THREE.Vector3( -1.1, 0, 0 ) },
];

export function buildChannelWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene );
	scene.add( createDeck( 60, { y: -3.4, divisions: 60 } ) );

	const interactables = [];

	const hStrip = createStrip( { count: SHOWN.d, cell: 0.17, gap: 0.06, depth: 0.17 } );
	hStrip.position.set( -4.8, 0, 0 );
	scene.add( hStrip );
	hStrip.userData.cells.forEach( ( c ) => { c.userData.kind = 'h'; interactables.push( c ); } );

	const hLabel = createLabel( 'h', 'label2d label2d-key' );
	hLabel.position.set( -4.8, 2.3, 0 );
	scene.add( hLabel );

	const wall = createWall( { rows: TOKENS.length, cols: SHOWN.d, cell: 0.17, gap: 0.06, depth: 0.05 } );
	wall.position.set( -3.2, PITCH / 2, 0 );
	scene.add( wall );
	wall.userData.cells.forEach( ( c ) => { c.userData.kind = 'w'; interactables.push( c ); } );

	const wallLabel = createLabel( 'lm_head.weight', 'label2d label2d-key' );
	wallLabel.position.set( -3.2, 2.55, 0 );
	scene.add( wallLabel );

	const fan = createLinks( Array.from( { length: TOKENS.length }, ( _, r ) => [
		new THREE.Vector3( -2.28, rowY( r ) + PITCH / 2, 0 ),
		new THREE.Vector3( BAR_X, rowY( r ), 0 ),
	] ) );
	scene.add( fan );

	const bars = [];
	const tokLabels = [];
	const valLabels = [];

	for ( let i = 0; i < ROWS; i ++ ) {

		const bar = createBar( { width: 0.15, depth: 0.15, color: THEME.accent, axis: 'x' } );
		bar.position.set( BAR_X, rowY( i ), 0 );
		bar.userData.kind = 'bar';
		bar.userData.tok = i;
		scene.add( bar );
		bars.push( bar );
		interactables.push( bar );

		const tl = createLabel( short( i ), 'label2d label2d-dim' );
		tl.position.set( BAR_X - 0.225, rowY( i ), 0 );
		scene.add( tl );
		tokLabels.push( tl );

		const vl = createLabel( '', 'label2d label2d-dim' );
		vl.position.set( 0.575, rowY( i ), 0 );
		scene.add( vl );
		valLabels.push( vl );

	}

	const textBars = bars.map( ( _, i ) => {

		const bar = createBar( { width: 0.07, depth: 0.07, color: THEME.rose, axis: 'x' } );
		bar.position.set( BAR_X, rowY( i ), -0.45 );
		scene.add( bar );
		return bar;

	} );

	const cut = new THREE.Mesh(
		new THREE.PlaneGeometry( 0.025, 2.5 ),
		new THREE.MeshBasicMaterial( { color: THEME.signal, transparent: true, opacity: 0.75, side: THREE.DoubleSide } ),
	);
	cut.position.set( BAR_X, -0.23, 0.2 );
	scene.add( cut );

	const cutLabel = createLabel( '', 'label2d label2d-dim' );
	cutLabel.position.set( BAR_X, 2.45, 0.2 );
	scene.add( cutLabel );

	const soft = createStrip( { count: SHOWN.d, cell: 0.17, gap: 0.06, depth: 0.17 } );
	soft.position.set( 1.7, 0, 0 );
	scene.add( soft );
	soft.userData.cells.forEach( ( c ) => { c.userData.kind = 'u'; interactables.push( c ); } );

	const softLabel = createLabel( 'e_msg', 'label2d label2d-key' );
	softLabel.position.set( 1.7, 2.3, 0 );
	scene.add( softLabel );

	const send = createLinks( Array.from( { length: ROWS }, ( _, i ) => [
		new THREE.Vector3( 0.8, rowY( i ), 0 ),
		new THREE.Vector3( 1.7, 0, 0 ),
	] ) );
	scene.add( send );

	const stage = createLabel( '', 'label2d label2d-key' );
	stage.position.set( -0.65, 2.85, 0 );
	scene.add( stage );

	const textLabel = createLabel( '', 'label2d label2d-dim' );
	textLabel.position.set( -0.65, -2.75, -0.45 );
	scene.add( textLabel );

	let step = 0;
	let agent = 1;
	let run = null;
	let round = 0;

	function state() {

		return run.rounds[ Math.min( round, run.rounds.length - 1 ) ].per[ agent ];

	}

	function render() {

		const s = state();
		const a = AGENTS[ agent ];
		const kept = new Map( s.msg.map( ( m ) => [ m.v, m.q ] ) );
		const zMin = Math.min( ...s.logits );
		const zMax = Math.max( ...s.logits );

		hStrip.userData.cells.forEach( ( c, d ) => {

			paintCell( c, s.h[ d ], { gain: 0.35, dim: step > 1 } );
			c.userData.dim = d;

		} );

		wall.userData.cells.forEach( ( c ) => {

			paintCell( c, EMB[ c.userData.row ][ c.userData.col ], { gain: 1.6, dim: step < 1 || step > 2 } );

		} );

		fan.visible = step === 1;
		fan.userData.paint( ( r ) => new THREE.Color( s.logits[ r ] >= 0 ? THEME.accent : THEME.info )
			.multiplyScalar( 0.25 + Math.min( 1, Math.abs( s.logits[ r ] ) / Math.max( 0.001, zMax ) ) * 0.9 ) );

		bars.forEach( ( bar, i ) => {

			let len = 0.02;
			let value = 0;
			let live = true;

			if ( step === 0 ) {

				len = 0.02;

			} else if ( step === 1 ) {

				value = s.logits[ i ];
				len = 0.12 + ( value - zMin ) / Math.max( 0.001, zMax - zMin ) * 3.4;

			} else if ( step === 2 ) {

				value = s.p[ i ];
				len = 0.02 + value * 3.4;

			} else if ( step === 3 ) {

				value = s.p[ i ];
				len = 0.02 + value * 3.4;
				live = kept.has( i );

			} else {

				value = kept.get( i ) || 0;
				len = 0.02 + value * 3.4;
				live = kept.has( i );

			}

			setBar( bar, len );
			bar.userData.value = value;
			bar.userData.live = live;
			const isAnswer = i === 0;
			tintBar( bar, ! live ? THEME.muted : isAnswer ? THEME.accent : a.color, ! live ? 0.08 : isAnswer ? 0.85 : 0.4 );

			tokLabels[ i ].element.style.opacity = live ? '1' : '0.3';
			valLabels[ i ].element.textContent = step === 0 ? '' : step === 1 ? value.toFixed( 2 ) : value.toFixed( 3 );
			valLabels[ i ].element.style.opacity = live ? '1' : '0.3';

		} );

		const pMin = Math.min( ...s.msg.map( ( m ) => s.p[ m.v ] ) );
		cut.visible = step === 3;
		cut.position.x = BAR_X + 0.02 + pMin * 3.4;
		cutLabel.visible = cut.visible;
		cutLabel.position.x = cut.position.x;
		cutLabel.element.textContent = `nucleus · ${ s.msg.length } of ${ ORCH.vocab.toLocaleString( 'en-AU' ) } · mass ${ s.msgMass.toFixed( 3 ) }`;

		const lit = step >= 4;
		soft.userData.cells.forEach( ( c, d ) => {

			paintCell( c, s.u[ d ], { gain: 2.2, dim: ! lit } );
			c.userData.dim = d;

		} );
		softLabel.element.style.opacity = lit ? '1' : '0.3';

		send.visible = step === 4;
		send.userData.paint( ( i ) => new THREE.Color( kept.has( i ) ? a.color : THEME.bg ).multiplyScalar( kept.has( i ) ? 0.9 : 0 ) );

		const top = argmax( s.p );
		textBars.forEach( ( bar, i ) => {

			bar.visible = step === 5;
			setBar( bar, i === top ? 3.4 : 0.02 );
			tintBar( bar, i === top ? THEME.rose : THEME.muted, i === top ? 0.8 : 0.06 );

		} );
		textLabel.visible = step === 5;
		textLabel.element.textContent = `text channel — one token "${ short( top ) }", no confidence`;

		const names = [ 'hidden state', 'logits', `probabilities · T ${ a.temp.toFixed( 2 ) }`, 'nucleus cut', 'packet → soft token', 'latent vs text' ];
		stage.element.textContent = `${ a.name } · round ${ run.rounds[ Math.min( round, run.rounds.length - 1 ) ].r } · ${ names[ step ] }`;

	}

	return {
		scene,
		interactables,
		getStepView( i ) { return VIEWS[ Math.max( 0, Math.min( VIEWS.length - 1, i ) ) ]; },
		setRun( next ) { run = next; round = Math.min( round, run.rounds.length - 1 ); render(); },
		setRound( r ) { round = r; if ( run ) render(); },
		setAgent( i ) { agent = i; if ( run ) render(); },
		setStep( i ) { step = i; if ( run ) render(); },
		getAgent() { return agent; },
		getState() { return state(); },
		describe( object ) {

			const u = object.userData;
			const s = state();
			const a = AGENTS[ agent ];

			if ( u.kind === 'h' ) return {
				category: `${ a.name } · hidden state`,
				name: `h[${ u.dim }]`,
				blurb: `dimension ${ u.dim } of ${ ORCH.dModel }`,
				description: `The last block leaves ${ ORCH.dModel } numbers per position. Eight are drawn. Nothing in this vector names a token — the LM head is what turns it into scores.`,
				metricLabel: 'value',
				metric: s.h[ u.dim ].toFixed( 4 ),
			};

			if ( u.kind === 'w' ) return {
				category: 'lm_head.weight',
				name: `row "${ short( u.row ) }", column ${ u.col }`,
				blurb: `${ ORCH.vocab.toLocaleString( 'en-AU' ) } × ${ ORCH.dModel }, tied to wte`,
				description: `Row "${ short( u.row ) }" is that token's embedding. Its dot product with h is the token's logit, and the same row is what the packet re-embeds against on the way out.`,
				metricLabel: 'weight',
				metric: EMB[ u.row ][ u.col ].toFixed( 4 ),
			};

			if ( u.kind === 'u' ) return {
				category: `${ a.name } · packet`,
				name: `e_msg[${ u.dim }]`,
				blurb: `Σ q · wte over ${ s.msg.length } ${ s.msg.length === 1 ? 'pair' : 'pairs' }`,
				description: `The expectation of the token embedding under the packet. Norm ${ s.rawNorm.toFixed( 3 ) } before the cap, ${ Math.hypot( ...s.u ).toFixed( 3 ) } after. This is what the receiver reads as one soft token.`,
				metricLabel: 'value',
				metric: s.u[ u.dim ].toFixed( 4 ),
			};

			const q = s.msg.find( ( m ) => m.v === u.tok );

			return {
				category: `${ a.name } · "${ short( u.tok ) }"`,
				name: u.live ? 'in the packet' : 'cut by the nucleus',
				blurb: `logit ${ s.logits[ u.tok ].toFixed( 3 ) } · p ${ s.p[ u.tok ].toFixed( 4 ) }`,
				description: u.live
					? `Renormalised to ${ q.q.toFixed( 4 ) } inside a packet carrying ${ s.msgMass.toFixed( 3 ) } of the raw mass and ${ s.msgBits.toFixed( 2 ) } bits.`
					: `Below the nucleus boundary at this temperature, so it is never put on the wire. Raise top-N or top-p and it comes back.`,
				metricLabel: 'probability',
				metric: s.p[ u.tok ].toFixed( 4 ),
			};

		},
		update() {},
	};

}
