import * as THREE from 'three';
import { addStandardLighting, createDeck, createLabel, THEME, EMISSIVE } from '../utils/sceneKit.js';
import { createWall, createFrame, createBar, paintCell } from '../utils/tensorKit.js';
import { MODELS, BY_MODEL, headParams, fmtCount, fmtPct } from '../data/lmhead.js';

// d_model × vocab_size, drawn honestly: the toy head as a real wall, the
// production heads as log-scale frames it disappears into.

const LOG_UNIT = 2.2; // world units per decade

const VIEWS = [
	{ position: new THREE.Vector3( -11, 1.2, 9 ), target: new THREE.Vector3( -11, 0.5, 0 ) },
	{ position: new THREE.Vector3( -0.6, 1.6, 22 ), target: new THREE.Vector3( -0.6, 0.8, 0 ) },
	{ position: new THREE.Vector3( 9.9, 0.6, 13 ), target: new THREE.Vector3( 9.9, -0.9, 0 ) },
	{ position: new THREE.Vector3( 0, 4.2, 11 ), target: new THREE.Vector3( 0, 3.8, 0 ) },
	{ position: new THREE.Vector3( -8.8, -0.8, 12 ), target: new THREE.Vector3( -8.8, -2.0, 0 ) },
	{ position: new THREE.Vector3( 3.6, 1.2, 12 ), target: new THREE.Vector3( 3.6, 0.6, 0 ) },
];

const OVERVIEW = { position: new THREE.Vector3( 0.5, 2.4, 27 ), target: new THREE.Vector3( 0.5, 0.2, 0 ) };

export function buildDimsWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene );
	scene.add( createDeck( 80, { y: -5.6, divisions: 80 } ) );

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

	// -- the toy head, actual size --------------------------------------------
	const toyWall = createWall( { rows: 6, cols: 16, cell: 0.14, gap: 0.03, depth: 0.14 } );
	toyWall.position.set( -11, 0.5, 0 );
	toyWall.userData.cells.forEach( ( m ) => ( m.userData.kind = 'toy' ) );
	rig.add( toyWall );
	label( 'toy', 'toy head · 6 × 16 = 96 weights', 'label2d label2d-key', -11, 1.4 );
	interactables.push( toyWall );

	// -- log-scale frames, lower-left corners aligned ---------------------------
	const CORNER = new THREE.Vector3( -6.5, -3.4, 0 );
	const frames = {};
	const framePlates = {};

	MODELS.forEach( ( m, i ) => {

		const w = Math.log10( m.vocab ) * LOG_UNIT;
		const hgt = Math.log10( m.d ) * LOG_UNIT;

		const frame = createFrame( w, hgt, { color: m.key === 'toy' ? THEME.signal : THEME.accent, opacity: 0.5 } );
		frame.position.set( CORNER.x + w / 2, CORNER.y + hgt / 2, -0.02 * i );
		rig.add( frame );
		frames[ m.key ] = frame;

		// An invisible-ish plate so the frame is clickable.
		const plate = new THREE.Mesh(
			new THREE.PlaneGeometry( w, hgt ),
			new THREE.MeshStandardMaterial( {
				color: THEME.accent, emissive: THEME.accent, emissiveIntensity: 0.04 * EMISSIVE,
				transparent: true, opacity: 0.05, side: THREE.DoubleSide,
			} ),
		);
		plate.position.copy( frame.position );
		plate.userData.kind = 'frame';
		plate.userData.model = m.key;
		rig.add( plate );
		framePlates[ m.key ] = plate;
		interactables.push( plate );

		if ( m.key !== 'toy' ) label( `f-${ m.key }`, `${ m.label } · ${ m.d } × ${ m.vocab.toLocaleString( 'en-AU' ) }`, 'label2d label2d-dim', CORNER.x + w - 1.4, CORNER.y + hgt + 0.3 );

	} );
	label( 'axes', 'axes: log₁₀ · x = vocab · y = d_model', 'label2d label2d-dim', CORNER.x + 5.6, CORNER.y - 0.6 );

	// -- parameter-count bars ----------------------------------------------------
	const paramGroup = new THREE.Group();
	rig.add( paramGroup );
	const paramBars = {};

	MODELS.forEach( ( m, i ) => {

		const x = 7.6 + i * 1.3;
		const hp = headParams( m );
		const bar = createBar( { width: 0.6, depth: 0.6, color: THEME.violet } );
		bar.position.set( x, -3.4, 0 );
		bar.scale.y = Math.max( 0.05, ( Math.log10( hp ) - 1 ) * 0.52 );
		bar.userData.kind = 'params';
		bar.userData.model = m.key;
		paramGroup.add( bar );
		paramBars[ m.key ] = bar;
		interactables.push( bar );

		// Staggered so neighbouring labels don't collide at the overview distance.
		const l = createLabel( `${ m.label } · ${ fmtCount( hp ) }`, 'label2d label2d-dim' );
		l.position.set( x, -3.8 - ( i % 2 ) * 0.5, 0 );
		paramGroup.add( l );

	} );
	label( 'params', 'head parameters = d · V (log height)', 'label2d label2d-key', 10.2, 1.6 );

	// -- weight tying: E and W as two frames that merge ---------------------------
	const tieGroup = new THREE.Group();
	tieGroup.position.set( 0, 3.8, 0 );
	rig.add( tieGroup );

	const eFrame = createFrame( 1.2, 3.0, { color: THEME.info, opacity: 0.7 } );
	eFrame.position.set( -2.2, 0, 0 );
	tieGroup.add( eFrame );

	const wFrame = createFrame( 3.0, 1.2, { color: THEME.accent, opacity: 0.7 } );
	wFrame.position.set( 2.2, 0, 0 );
	tieGroup.add( wFrame );

	const eLabel = createLabel( 'E · (V, d)', 'label2d label2d-dim' );
	eLabel.position.set( -2.2, 1.9, 0 );
	tieGroup.add( eLabel );

	const wLabel = createLabel( 'W · (d, V)', 'label2d label2d-dim' );
	wLabel.position.set( 2.2, 1.1, 0 );
	tieGroup.add( wLabel );

	const tieLabel = createLabel( '', 'label2d label2d-key' );
	tieLabel.position.set( 0, -1.6, 0 );
	tieGroup.add( tieLabel );

	// -- growth bars: d and V per real model --------------------------------------
	const growthGroup = new THREE.Group();
	growthGroup.position.set( -11.4, -2.2, 0 );
	rig.add( growthGroup );

	MODELS.filter( ( m ) => m.key !== 'toy' ).forEach( ( m, i ) => {

		const x = i * 1.6;
		const dBar = createBar( { width: 0.34, depth: 0.34, color: THEME.signal } );
		dBar.position.set( x, 0, 0 );
		dBar.scale.y = m.d / 4096;
		growthGroup.add( dBar );

		const vBar = createBar( { width: 0.34, depth: 0.34, color: THEME.info } );
		vBar.position.set( x + 0.42, 0, 0 );
		vBar.scale.y = m.vocab / 64000;
		growthGroup.add( vBar );

		const l = createLabel( m.label, 'label2d label2d-dim' );
		l.position.set( x + 0.2, -0.45, 0 );
		growthGroup.add( l );

	} );
	const growthKey = createLabel( 'amber = d_model · blue = vocab (linear)', 'label2d label2d-dim' );
	growthKey.position.set( 2.4, 2.6, 0 );
	growthGroup.add( growthKey );

	// -- swap-the-head ghosts -------------------------------------------------------
	const ghostGroup = new THREE.Group();
	ghostGroup.position.set( 3.6, 0.6, 0 );
	rig.add( ghostGroup );

	const trunk = new THREE.Mesh(
		new THREE.BoxGeometry( 1.0, 2.2, 1.4 ),
		new THREE.MeshStandardMaterial( {
			color: THEME.violet, emissive: THEME.violet, emissiveIntensity: 0.3 * EMISSIVE,
			transparent: true, opacity: 0.5, roughness: 0.4, metalness: 0.3,
		} ),
	);
	trunk.position.set( -2.4, 0, 0 );
	ghostGroup.add( trunk );
	const trunkLabel = createLabel( 'same backbone', 'label2d label2d-key' );
	trunkLabel.position.set( -2.4, 1.6, 0 );
	ghostGroup.add( trunkLabel );

	const HEADS = [
		{ key: 'lm', name: 'LM head', dims: '(d, V)', w: 1.7, note: 'next-word distribution' },
		{ key: 'cls', name: 'classifier', dims: '(d, 2)', w: 0.5, note: 'spam / not spam' },
		{ key: 'reward', name: 'reward model', dims: '(d, 1)', w: 0.24, note: 'one scalar score' },
	];

	HEADS.forEach( ( hd, i ) => {

		const slab = new THREE.Mesh(
			new THREE.BoxGeometry( hd.w, 1.1, 0.5 ),
			new THREE.MeshStandardMaterial( {
				color: THEME.accent, emissive: THEME.accent, emissiveIntensity: ( i === 0 ? 0.5 : 0.2 ) * EMISSIVE,
				transparent: true, opacity: i === 0 ? 0.75 : 0.35, roughness: 0.4, metalness: 0.2,
			} ),
		);
		slab.position.set( i * 2.1 - 0.4, 0, 0 );
		slab.userData.kind = 'ghost';
		slab.userData.head = hd.key;
		ghostGroup.add( slab );
		interactables.push( slab );

		const l = createLabel( `${ hd.name } ${ hd.dims }`, i === 0 ? 'label2d label2d-key' : 'label2d label2d-dim' );
		l.position.set( i * 2.1 - 0.4, 0.95, 0 );
		ghostGroup.add( l );

	} );

	// -- state -----------------------------------------------------------------------
	let step = 0;
	let modelKey = 'gpt2';
	let tied = true;

	function paintAll() {

		toyWall.userData.cells.forEach( ( m ) => paintCell( m, THEME.signal, step === 0 ? 0.5 : 0.25 ) );

		MODELS.forEach( ( m ) => {

			const active = m.key === modelKey;
			frames[ m.key ].material.opacity = step >= 1 ? ( active ? 0.9 : 0.4 ) : 0.12;
			framePlates[ m.key ].material.opacity = active && step >= 1 ? 0.12 : 0.04;
			paramBars[ m.key ].material.emissiveIntensity = ( active ? 0.8 : 0.35 ) * EMISSIVE;

		} );
		paramGroup.visible = step >= 2;

		tieGroup.visible = step === 3;
		if ( step === 3 ) {

			const m = BY_MODEL[ modelKey ];
			wFrame.position.x = tied ? -2.2 : 2.2;
			wFrame.rotation.z = tied ? Math.PI / 2 : 0;
			wLabel.position.set( tied ? -1.2 : 2.2, tied ? 0 : 1.1, 0 );
			wLabel.element.textContent = tied ? 'W = Eᵀ (same storage)' : 'W · (d, V)';
			tieLabel.element.textContent = tied
				? `stored once · ${ fmtCount( headParams( m ) ) } weights saved`
				: `stored twice · 2 × ${ fmtCount( headParams( m ) ) } weights`;

		}

		growthGroup.visible = step === 4;
		ghostGroup.visible = step === 5;
		labels.params.visible = step >= 2;
		labels.params.element.className = 'label2d ' + ( step === 2 ? 'label2d-key' : 'label2d-dim' );
		labels.toy.element.className = 'label2d ' + ( step === 0 ? 'label2d-key' : 'label2d-dim' );

	}

	return {
		scene,
		interactables,
		getStepView( i ) { return VIEWS[ i ]; },
		getOverview() { return OVERVIEW; },
		setStep( i ) { step = i; paintAll(); },
		getState() { return { step, modelKey, tied, model: BY_MODEL[ modelKey ] }; },
		setModel( key ) {

			modelKey = key;
			tied = BY_MODEL[ key ].tied;
			paintAll();
			return BY_MODEL[ key ];

		},
		setTied( t ) { tied = t; paintAll(); return tied; },
		describe( object ) {

			const u = object.userData;

			if ( u.kind === 'toy' ) return {
				category: 'toy model',
				name: 'the whole head',
				blurb: '6 × 16 = 96 weights',
				description: 'Every page on this site runs on this matrix. Production heads have the same shape with both axes a few decades longer.',
				metricLabel: 'params', metric: '96',
			};

			if ( u.kind === 'frame' ) {

				const m = BY_MODEL[ u.model ];
				return {
					category: 'to scale (log)',
					name: m.label,
					blurb: `${ m.d } × ${ m.vocab.toLocaleString( 'en-AU' ) }`,
					description: `${ fmtCount( headParams( m ) ) } head parameters — ${ fmtPct( headParams( m ) / m.total ) } of the model's ${ fmtCount( m.total ) } total. ${ m.tied ? 'Ties the head to the embedding.' : 'Keeps head and embedding separate.' }`,
					metricLabel: 'd · V', metric: fmtCount( headParams( m ) ),
				};

			}

			if ( u.kind === 'params' ) {

				const m = BY_MODEL[ u.model ];
				return {
					category: 'parameters',
					name: `${ m.label } head`,
					blurb: `${ fmtCount( headParams( m ) ) } weights`,
					description: `d · V = ${ m.d } · ${ m.vocab.toLocaleString( 'en-AU' ) }. At fp16 that is ${ ( headParams( m ) * 2 / 2 ** 30 ).toFixed( 2 ) } GiB read for every generated token at batch 1.`,
					metricLabel: 'share of model', metric: fmtPct( headParams( m ) / m.total ),
				};

			}

			if ( u.kind === 'ghost' ) {

				const hd = HEADS.find( ( x ) => x.key === u.head );
				return {
					category: 'a different head',
					name: hd.name,
					blurb: hd.dims,
					description: `Same backbone, different last matrix: ${ hd.note }. Only the output width changes — this is the whole meaning of "head".`,
					metricLabel: 'output dim', metric: hd.dims,
				};

			}

			return null;

		},
		update() {},
	};

}
