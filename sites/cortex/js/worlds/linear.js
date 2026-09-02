import * as THREE from 'three';
import { addStandardLighting, createDeck, createLabel, THEME } from '../utils/sceneKit.js';
import { createStrip, createWall, createBar, setBar, tintBar, cellAt, paintCell, createFrame } from '../utils/tensorKit.js';
import { tween, Easing } from '../utils/tween.js';
import { VOCAB_ROWS, SHOWN, GPT2, HIDDEN, mixedHidden, logitsFor } from '../data/model.js';

const X_H = -5.4;
const X_W = -1.8;
const X_ZERO = 2.4;
const X_LABEL = 5.6;
const GEO_X = 18;
const HEAD_X = 34;

const V = SHOWN.vocab;
const CELL = 0.26, GAPC = 0.07;
const ROW_STEP = CELL + GAPC;
const BAR_SCALE = 0.42;

const VIEWS = [
	{ position: new THREE.Vector3( 0, 1.4, 17 ), target: new THREE.Vector3( 0, 0, 0 ) },
	{ position: new THREE.Vector3( 0.6, 1.2, 15 ), target: new THREE.Vector3( 0.6, 0, 0 ) },
	{ position: new THREE.Vector3( 1.2, 0.8, 11 ), target: new THREE.Vector3( 1.2, 0, 0 ) },
	{ position: new THREE.Vector3( GEO_X + 3.2, 2.6, 9 ), target: new THREE.Vector3( GEO_X, 0.3, 0 ) },
	{ position: new THREE.Vector3( HEAD_X, 1.2, 14 ), target: new THREE.Vector3( HEAD_X, 0.4, 0 ) },
];

export function buildLinearWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene );
	scene.add( createDeck( 90, { y: -4.4, divisions: 90 } ) );

	const rig = new THREE.Group();
	scene.add( rig );

	const main = new THREE.Group();
	rig.add( main );

	const interactables = [];

	const hStrip = createStrip( { count: SHOWN.d, cell: 0.3, gap: 0.07 } );
	hStrip.position.set( X_H, 0, 0 );
	main.add( hStrip );

	const wall = createWall( { rows: V, cols: SHOWN.d, cell: CELL, gap: GAPC } );
	wall.position.set( X_W, 0, 0 );
	main.add( wall );

	VOCAB_ROWS.forEach( ( r, v ) => {

		r.embed.forEach( ( value, i ) => paintCell( cellAt( wall, v, i ), value, { pos: THEME.violet, neg: THEME.rose, gain: 1.2 } ) );

	} );

	const frame = createFrame( wall.userData.width + 0.1, wall.userData.height + 0.1 );
	frame.position.copy( wall.position );
	main.add( frame );

	const zeroLine = new THREE.Mesh(
		new THREE.BoxGeometry( 0.02, V * ROW_STEP + 0.4, 0.02 ),
		new THREE.MeshBasicMaterial( { color: THEME.muted } ),
	);
	zeroLine.position.set( X_ZERO, 0, 0 );
	main.add( zeroLine );

	const bars = [];
	const rowLabels = [];

	VOCAB_ROWS.forEach( ( r, v ) => {

		const y = ( ( V - 1 ) / 2 - v ) * ROW_STEP;

		const bar = createBar( { width: 0.16, depth: 0.16, axis: 'x', color: THEME.accent } );
		bar.position.set( X_ZERO, y, 0 );
		bar.userData.rank = v;
		main.add( bar );
		bars.push( bar );
		interactables.push( bar );

		const label = createLabel( r.token, 'label2d label2d-dim' );
		label.position.set( X_LABEL, y, 0 );
		main.add( label );
		rowLabels.push( label );

	} );

	function tag( text, sub, x, y ) {

		const head = createLabel( text, 'label2d label2d-key' );
		head.position.set( x, y, 0 );
		main.add( head );
		const s = createLabel( sub, 'label2d label2d-dim' );
		s.position.set( x, y - 0.36, 0 );
		main.add( s );
		return { head, sub: s };

	}

	tag( 'h  ·  final hidden state', `${ SHOWN.d } of ${ GPT2.dModel } dims`, X_H, -2.6 );
	tag( 'lm_head.weight', `${ V } of ${ GPT2.vocab.toLocaleString( 'en-AU' ) } rows × ${ SHOWN.d } of ${ GPT2.dModel } cols`, X_W, -2.6 );
	const logitTag = tag( 'logits', 'raw scores — not probabilities', X_ZERO + 1.4, -2.6 );

	/* ------------------------------------------------ geometry station --- */

	const geo = new THREE.Group();
	geo.position.set( GEO_X, 0, 0 );
	rig.add( geo );

	const sphere = new THREE.Mesh(
		new THREE.SphereGeometry( 2.2, 24, 16 ),
		new THREE.MeshBasicMaterial( { color: THEME.muted, wireframe: true, transparent: true, opacity: 0.14 } ),
	);
	geo.add( sphere );

	const arrows = VOCAB_ROWS.map( ( r, v ) => {

		const dir = new THREE.Vector3( r.embed[ 0 ], r.embed[ 1 ], r.embed[ 2 ] );
		const len = dir.length() * 2.0;
		const arrow = new THREE.ArrowHelper( dir.clone().normalize(), new THREE.Vector3(), len, v === 0 ? THEME.violet : THEME.muted, 0.22, 0.13 );
		geo.add( arrow );

		if ( v < 3 ) {

			const label = createLabel( r.token, 'label2d label2d-dim' );
			label.position.copy( dir.clone().normalize().multiplyScalar( len + 0.25 ) );
			geo.add( label );

		}

		return arrow;

	} );

	const hArrow = new THREE.ArrowHelper( new THREE.Vector3( 0, 1, 0 ), new THREE.Vector3(), 2.4, THEME.accent, 0.3, 0.18 );
	geo.add( hArrow );

	const hArrowLabel = createLabel( 'h', 'label2d label2d-key' );
	geo.add( hArrowLabel );

	const cosLabel = createLabel( 'cos θ', 'label2d label2d-dim' );
	cosLabel.position.set( 0, -2.8, 0 );
	geo.add( cosLabel );

	/* --------------------------------------------------- head station ---- */

	const heads = new THREE.Group();
	heads.position.set( HEAD_X, 0, 0 );
	rig.add( heads );

	const trunk = new THREE.Group();
	trunk.position.set( -3.6, 0, 0 );
	heads.add( trunk );

	for ( let i = 0; i < GPT2.layers; i ++ ) {

		const plate = new THREE.Mesh(
			new THREE.BoxGeometry( 2.0, 0.16, 1.2 ),
			new THREE.MeshStandardMaterial( { color: 0x1b262c, emissive: THEME.info, emissiveIntensity: 0.06, roughness: 0.5, metalness: 0.3 } ),
		);
		plate.position.y = -2.2 + i * 0.36;
		trunk.add( plate );

	}

	const trunkLabel = createLabel( 'trunk — 12 decoder blocks', 'label2d label2d-dim' );
	trunkLabel.position.set( -3.6, -2.9, 0 );
	heads.add( trunkLabel );

	function headPlate( x, y, color, title, sub, dim ) {

		const plate = new THREE.Mesh(
			new THREE.BoxGeometry( 2.4, 0.9, 1.2 ),
			new THREE.MeshStandardMaterial( {
				color, emissive: color, emissiveIntensity: dim ? 0.08 : 0.55,
				roughness: 0.45, metalness: 0.25, transparent: true, opacity: dim ? 0.35 : 1,
			} ),
		);
		plate.position.set( x, y, 0 );
		heads.add( plate );

		const t = createLabel( title, dim ? 'label2d label2d-dim' : 'label2d label2d-key' );
		t.position.set( x, y + 0.55, 0 );
		heads.add( t );

		const s = createLabel( sub, 'label2d label2d-dim' );
		s.position.set( x, y - 0.65, 0 );
		heads.add( s );

		return plate;

	}

	headPlate( 1.4, 1.3, THEME.accent, 'LM head', `linear 768 → ${ GPT2.vocab.toLocaleString( 'en-AU' ) } · tied to wte`, false );
	headPlate( 1.4, -1.3, THEME.info, 'classification head', 'linear 768 → 2 · same trunk', true );

	const feed = new THREE.Mesh(
		new THREE.TubeGeometry( new THREE.CatmullRomCurve3( [
			new THREE.Vector3( -3.6, 1.9, 0 ), new THREE.Vector3( -2.0, 2.2, 0 ), new THREE.Vector3( 0.2, 1.3, 0 ),
		] ), 30, 0.03, 6, false ),
		new THREE.MeshStandardMaterial( { color: THEME.accent, emissive: THEME.accent, emissiveIntensity: 0.5 } ),
	);
	heads.add( feed );

	/* --------------------------------------------------------- state ----- */

	let step = 0;
	let mix = 0;
	let hidden = HIDDEN;
	let logits = logitsFor( hidden );
	let sweep = 0;

	function render() {

		hidden = mixedHidden( mix );
		logits = logitsFor( hidden );

		hStrip.userData.cells.forEach( ( c, i ) => paintCell( c, hidden[ i ], { gain: 0.7 } ) );

		const best = logits.indexOf( Math.max( ...logits ) );

		bars.forEach( ( bar, v ) => {

			const z = logits[ v ];
			const len = Math.abs( z ) * BAR_SCALE;
			setBar( bar, Math.max( 0.02, len ) );
			bar.rotation.y = z >= 0 ? 0 : Math.PI;
			tintBar( bar, v === best ? THEME.accent : z >= 0 ? THEME.violet : THEME.info, v === best ? 0.85 : 0.35 );
			bar.visible = step >= 1;

			rowLabels[ v ].element.textContent = `${ VOCAB_ROWS[ v ].token }   ${ z >= 0 ? '+' : '' }${ z.toFixed( 2 ) }`;
			rowLabels[ v ].element.className = v === best ? 'label2d label2d-key' : 'label2d label2d-dim';
			rowLabels[ v ].visible = step >= 1;

		} );

		main.visible = step < 3;

		logitTag.head.element.textContent = step >= 1 ? 'logits' : 'logits — one per vocabulary entry';

		const hv = new THREE.Vector3( hidden[ 0 ], hidden[ 1 ], hidden[ 2 ] );
		const hlen = Math.max( 0.4, hv.length() * 1.1 );
		hArrow.setDirection( hv.clone().normalize() );
		hArrow.setLength( hlen, 0.3, 0.18 );
		hArrowLabel.position.copy( hv.clone().normalize().multiplyScalar( hlen + 0.3 ) );

		const top = VOCAB_ROWS[ best ];
		const ev = new THREE.Vector3( top.embed[ 0 ], top.embed[ 1 ], top.embed[ 2 ] );
		const cos = hv.clone().normalize().dot( ev.clone().normalize() );
		cosLabel.element.textContent = `best "${ top.token.trim() }"  ·  cos θ = ${ cos.toFixed( 3 ) }  ·  logit ${ logits[ best ].toFixed( 2 ) }`;

		arrows.forEach( ( a, v ) => a.setColor( new THREE.Color( v === best ? THEME.violet : THEME.muted ) ) );

		geo.visible = step === 3;
		heads.visible = step === 4;

	}

	function highlightRow( v ) {

		wall.userData.cells.forEach( ( c, idx ) => {

			const row = Math.floor( idx / SHOWN.d );
			const dimmed = v >= 0 && row !== v;
			paintCell( c, VOCAB_ROWS[ row ].embed[ idx % SHOWN.d ], { pos: THEME.violet, neg: THEME.rose, gain: 1.2, dim: dimmed } );

		} );

		bars.forEach( ( b, i ) => { b.scale.z = v === i ? 1.8 : 1; b.scale.y = v === i ? 1.8 : 1; } );

	}

	render();

	interactables.push( wall );

	let elapsed = 0;

	return {
		scene,
		interactables,
		stepCount: 5,
		defaultView: VIEWS[ 0 ],
		getStepView( i ) { return VIEWS[ Math.max( 0, Math.min( VIEWS.length - 1, i ) ) ]; },
		setStep( i ) {

			step = i;
			sweep = 0;
			render();
			if ( i !== 2 ) highlightRow( -1 );
			if ( i === 1 ) bars.forEach( ( b, v ) => tween( 0.4, ( t ) => { b.scale.x = Math.abs( logits[ v ] ) * BAR_SCALE * t; }, { easing: Easing.cubicOut } ) );
			return { hidden, logits };

		},
		setMix( value ) {

			mix = value;
			render();
			return { hidden, logits, mix };

		},
		getState() { return { hidden, logits, mix, step }; },
		describe( object ) {

			const v = object.userData.rank !== undefined ? object.userData.rank : object.userData.row;
			const row = VOCAB_ROWS[ v ];
			return {
				category: 'vocabulary row',
				name: `"${ row.token.trim() }"`,
				blurb: `token id ${ row.id } · row ${ v + 1 } of ${ GPT2.vocab.toLocaleString( 'en-AU' ) }`,
				description: `Its logit is the dot product of h with this row of lm_head.weight — the same vector the input embedding table uses for this token, because GPT-2 ties those weights.`,
				metricLabel: 'logit',
				metric: logits[ v ].toFixed( 4 ),
			};

		},
		update( dt ) {

			elapsed += dt;

			if ( step === 2 ) {

				sweep += dt * 1.6;
				highlightRow( Math.floor( sweep ) % V );

			}

			if ( step === 3 ) geo.rotation.y = Math.sin( elapsed * 0.25 ) * 0.5;

		},
	};

}
