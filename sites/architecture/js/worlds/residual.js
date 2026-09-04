import * as THREE from 'three';
import { addStandardLighting, createDeck, createLabel, THEME } from '../utils/sceneKit.js';
import { createRail, createFrame, cellMesh } from '../utils/tensorKit.js';
import { NORM_MODES, streamRms, blockInputRms } from '../data/norm.js';

const TOWER_X = -6.4;
const CHART_X = 4.6;
const BLOCKS = 4;
const PITCH = 1.72;
const BRANCH_DX = 2.0;
const TOP = ( BLOCKS * 2 ) * ( PITCH / 2 );

const CW = 8.4;
const CH = 5.0;
const SUB_MAX = 192;
const RMAX = 14;

const cx = ( i ) => i / SUB_MAX * CW - CW / 2;
const cy = ( r ) => Math.min( r, RMAX ) / RMAX * CH;

const VIEWS = [
	{ position: new THREE.Vector3( TOWER_X + 1.0, 0.4, 16.5 ), target: new THREE.Vector3( TOWER_X + 1.0, 0.2, 0 ) },
	{ position: new THREE.Vector3( CHART_X, -0.1, 18 ), target: new THREE.Vector3( CHART_X, -0.4, 0 ) },
	{ position: new THREE.Vector3( CHART_X, -0.1, 18 ), target: new THREE.Vector3( CHART_X, -0.4, 0 ) },
	{ position: new THREE.Vector3( TOWER_X + 1.0, 0.4, 16.5 ), target: new THREE.Vector3( TOWER_X + 1.0, 0.2, 0 ) },
	{ position: new THREE.Vector3( TOWER_X + 1.0, 0.4, 16.5 ), target: new THREE.Vector3( TOWER_X + 1.0, 0.2, 0 ) },
	{ position: new THREE.Vector3( -0.6, 0.2, 31 ), target: new THREE.Vector3( -0.6, 0.0, 0 ) },
];

const SUBS = [ 'Attn', 'MLP' ];

export function buildResidualWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene );
	scene.add( createDeck( 90, { y: -5.4, divisions: 90 } ) );

	const rig = new THREE.Group();
	scene.add( rig );

	const interactables = [];
	const labels = {};

	const label = ( key, text, cls, x, y, z = 0, parent = rig ) => {

		const l = createLabel( text, cls );
		l.position.set( x, y, z );
		parent.add( l );
		labels[ key ] = l;
		return l;

	};

	const tower = new THREE.Group();
	tower.position.set( TOWER_X, 0, 0 );
	rig.add( tower );

	const spine = createRail( new THREE.Vector3( 0, -TOP - 0.8, 0 ), new THREE.Vector3( 0, TOP + 0.9, 0 ), { color: THEME.accent, radius: 0.055, opacity: 0.85 } );
	spine.userData = { kind: 'spine' };
	tower.add( spine );
	interactables.push( spine );

	label( 'towerTop', 'to the LM head', 'label2d label2d-dim', 0, TOP + 1.35, 0, tower );
	label( 'towerFoot', 'token embedding', 'label2d label2d-dim', 0, -TOP - 1.25, 0, tower );

	const units = [];

	for ( let b = 0; b < BLOCKS; b ++ ) {

		for ( let s = 0; s < 2; s ++ ) {

			const idx = b * 2 + s;
			const y = -TOP + PITCH * 0.5 + idx * PITCH;

			const plate = new THREE.Mesh(
				new THREE.BoxGeometry( 1.7, 0.72, 0.5 ),
				new THREE.MeshStandardMaterial( { color: 0x16222a, emissive: THEME.info, emissiveIntensity: 0.2, roughness: 0.5, metalness: 0.2 } ),
			);
			plate.position.set( BRANCH_DX, y, 0 );
			plate.userData = { kind: 'branch', idx, sub: SUBS[ s ] };
			tower.add( plate );

			const cap = createLabel( `${ SUBS[ s ] } · block ${ b + 1 }`, 'label2d label2d-dim' );
			cap.position.set( BRANCH_DX, y + 0.62, 0 );
			tower.add( cap );

			tower.add( createRail( new THREE.Vector3( 0, y - 0.42, 0 ), new THREE.Vector3( BRANCH_DX - 0.85, y - 0.42, 0 ), { radius: 0.028 } ) );
			tower.add( createRail( new THREE.Vector3( BRANCH_DX - 0.85, y - 0.42, 0 ), new THREE.Vector3( BRANCH_DX - 0.85, y, 0 ), { radius: 0.028 } ) );
			tower.add( createRail( new THREE.Vector3( BRANCH_DX + 0.85, y, 0 ), new THREE.Vector3( BRANCH_DX + 0.85, y + 0.42, 0 ), { radius: 0.028 } ) );
			tower.add( createRail( new THREE.Vector3( BRANCH_DX + 0.85, y + 0.42, 0 ), new THREE.Vector3( 0, y + 0.42, 0 ), { radius: 0.028 } ) );

			const add = new THREE.Mesh(
				new THREE.TorusGeometry( 0.19, 0.05, 8, 20 ),
				new THREE.MeshStandardMaterial( { color: THEME.ink, emissive: THEME.ink, emissiveIntensity: 0.4 } ),
			);
			add.position.set( 0, y + 0.42, 0 );
			add.userData = { kind: 'add', idx };
			tower.add( add );

			const disc = new THREE.Mesh(
				new THREE.CylinderGeometry( 0.3, 0.3, 0.16, 20 ),
				new THREE.MeshStandardMaterial( { color: THEME.signal, emissive: THEME.signal, emissiveIntensity: 0.7, roughness: 0.4 } ),
			);
			disc.rotation.z = Math.PI / 2;
			disc.userData = { kind: 'norm', idx };
			tower.add( disc );

			units.push( { idx, y, plate, add, disc } );
			interactables.push( plate, add, disc );

		}

	}

	const finalDisc = new THREE.Mesh(
		new THREE.CylinderGeometry( 0.34, 0.34, 0.18, 20 ),
		new THREE.MeshStandardMaterial( { color: THEME.violet, emissive: THEME.violet, emissiveIntensity: 0.8 } ),
	);
	finalDisc.rotation.z = Math.PI / 2;
	finalDisc.position.set( 0, TOP + 0.65, 0 );
	finalDisc.userData = { kind: 'final' };
	tower.add( finalDisc );
	interactables.push( finalDisc );

	label( 'finalNorm', '', 'label2d label2d-key', 0.05, TOP + 0.95, 0, tower );

	const packets = [];
	for ( let i = 0; i < 6; i ++ ) {

		const p = cellMesh( 0.17, 0.17, THEME.accent );
		p.userData = { kind: 'packet', t: i / 6 };
		tower.add( p );
		packets.push( p );

	}

	const chart = new THREE.Group();
	chart.position.set( CHART_X, -2.6, 0 );
	rig.add( chart );

	chart.add( createRail( new THREE.Vector3( -CW / 2, 0, 0 ), new THREE.Vector3( CW / 2, 0, 0 ) ) );
	chart.add( createRail( new THREE.Vector3( -CW / 2, 0, 0 ), new THREE.Vector3( -CW / 2, CH, 0 ) ) );

	[ 0, 24, 48, 72, 96 ].forEach( ( l ) => {

		const t = createLabel( String( l ), 'label2d label2d-dim' );
		t.position.set( cx( l * 2 ), -0.35, 0 );
		chart.add( t );

	} );

	[ 1, 4, 8, 12 ].forEach( ( r ) => {

		const t = createLabel( String( r ), 'label2d label2d-dim' );
		t.position.set( -CW / 2 - 0.5, cy( r ), 0 );
		chart.add( t );

	} );

	const unitLine = new THREE.Line(
		new THREE.BufferGeometry().setFromPoints( [ new THREE.Vector3( -CW / 2, cy( 1 ), 0 ), new THREE.Vector3( CW / 2, cy( 1 ), 0 ) ] ),
		new THREE.LineDashedMaterial( { color: THEME.ink, transparent: true, opacity: 0.35, dashSize: 0.14, gapSize: 0.12 } ),
	);
	unitLine.computeLineDistances();
	chart.add( unitLine );

	const danger = new THREE.Mesh(
		new THREE.PlaneGeometry( CW, CH - cy( 4 ) ),
		new THREE.MeshBasicMaterial( { color: THEME.signal, transparent: true, opacity: 0.07, side: THREE.DoubleSide } ),
	);
	danger.position.set( 0, ( cy( 4 ) + CH ) / 2, -0.02 );
	danger.visible = false;
	chart.add( danger );

	const streamLine = new THREE.Line( new THREE.BufferGeometry(), new THREE.LineBasicMaterial( { color: THEME.signal, transparent: true, opacity: 0.95 } ) );
	const inputLine = new THREE.Line( new THREE.BufferGeometry(), new THREE.LineBasicMaterial( { color: THEME.accent, transparent: true, opacity: 0.95 } ) );
	chart.add( streamLine, inputLine );

	const head = new THREE.Mesh(
		new THREE.SphereGeometry( 0.15, 18, 12 ),
		new THREE.MeshStandardMaterial( { color: THEME.signal, emissive: THEME.signal, emissiveIntensity: 0.9 } ),
	);
	head.userData = { kind: 'head' };
	chart.add( head );
	interactables.push( head );

	label( 'headCap', '', 'label2d label2d-key', 0, 0.34, 0, head );
	label( 'chartX', 'transformer blocks', 'label2d label2d-dim', 0, -0.82, 0, chart );
	label( 'chartY', 'rms of the residual stream', 'label2d label2d-key', 0, CH + 0.4, 0, chart );
	label( 'inputCap', '', 'label2d label2d-dim', 0, 0, 0, chart );

	const frame = createFrame( CW + 0.5, CH + 0.6 );
	frame.position.set( CHART_X, -2.6 + CH / 2 - 0.05, -0.05 );
	rig.add( frame );

	let step = 0;
	let mode = 'pre';
	let layers = 32;
	let flow = 0;

	function state() {

		const subs = 2 * layers;
		const stream = streamRms( mode, subs );
		const input = blockInputRms( mode, subs );
		const last = stream[ subs ];
		return { mode, layers, subs, stream, input, last, inputLast: input[ subs ], logit: last * last };

	}

	function rebuild() {

		const s = state();
		const pts = ( arr ) => arr.map( ( r, i ) => new THREE.Vector3( cx( i ), cy( r ), 0 ) );

		streamLine.geometry.dispose();
		streamLine.geometry = new THREE.BufferGeometry().setFromPoints( pts( s.stream ) );

		inputLine.geometry.dispose();
		inputLine.geometry = new THREE.BufferGeometry().setFromPoints( pts( s.input ) );

		head.position.set( cx( s.subs ), cy( s.last ), 0 );
		labels.headCap.element.textContent = `rms ${ s.last.toFixed( 2 ) }`;

		labels.inputCap.element.textContent = `sub-layer input  rms ${ s.inputLast.toFixed( 2 ) }`;
		labels.inputCap.position.set( cx( s.subs ) + 0.1, cy( s.inputLast ) - 0.38, 0 );

		danger.visible = step === 2;

		const showNorm = mode !== 'none';
		units.forEach( ( u ) => {

			u.disc.visible = showNorm;
			if ( mode === 'post' ) u.disc.position.set( 0, u.y + 0.78, 0 );
			else u.disc.position.set( BRANCH_DX - 0.85, u.y - 0.42, 0 );
			u.disc.material.color.set( mode === 'post' ? THEME.rose : THEME.signal );
			u.disc.material.emissive.set( mode === 'post' ? THEME.rose : THEME.signal );
			u.plate.material.emissiveIntensity = step === 0 || step >= 3 ? 0.45 : 0.16;

		} );

		finalDisc.visible = mode === 'pre';
		labels.finalNorm.element.textContent = mode === 'pre' ? 'final norm' : '';
		spine.material.color.set( mode === 'post' ? THEME.muted : THEME.accent );
		spine.material.emissive.set( mode === 'post' ? THEME.muted : THEME.accent );
		labels.towerTop.element.textContent = mode === 'post' ? 'to the LM head · gradient rescaled ' + 2 * layers + '×' : 'to the LM head';

	}

	return {
		scene,
		interactables,
		getStepView( i ) { return VIEWS[ i ]; },
		getState: state,
		setStep( i ) { step = i; rebuild(); },
		setMode( key ) { mode = key; rebuild(); return state(); },
		setLayers( n ) { layers = n; rebuild(); return state(); },
		describe( object ) {

			const u = object.userData;
			const s = state();

			if ( u.kind === 'branch' ) return {
				category: 'sub-layer',
				name: u.sub,
				blurb: 'reads the stream, returns a correction',
				description: 'A sub-layer never sees the whole model — only the residual stream at its own depth. Whatever it returns is added, not substituted, so its output has to be on a scale the stream can absorb.',
				metricLabel: 'input rms in this mode', metric: s.inputLast.toFixed( 2 ),
			};

			if ( u.kind === 'add' ) return {
				category: 'residual add',
				name: '⊕',
				blurb: 'var(x + F) = var(x) + var(F)',
				description: 'Two roughly uncorrelated vectors add their variances, not their standard deviations. Every one of these rings raises the scale of the stream by a little, and nothing here brings it back down.',
				metricLabel: 'after ' + s.subs + ' adds', metric: 'rms ' + s.last.toFixed( 2 ),
			};

			if ( u.kind === 'norm' ) return {
				category: mode === 'post' ? 'post-norm' : 'pre-norm',
				name: mode === 'post' ? 'norm on the residual path' : 'norm on the branch',
				blurb: mode === 'post' ? 'x ← N(x + F(x))' : 'x ← x + F(N(x))',
				description: mode === 'post'
					? 'Because the norm sits on the path itself, every backward pass is rescaled once per block on the way down. Gradients at the output end start large, which is what learning-rate warm-up was covering for.'
					: 'The norm only touches the copy handed to the sub-layer. The residual path stays an unmodified identity from the first block to the last, so the gradient arrives at the bottom at full strength.',
				metricLabel: 'stream rms at the top', metric: s.last.toFixed( 2 ),
			};

			if ( u.kind === 'final' ) return {
				category: 'pre-norm',
				name: 'final norm',
				blurb: 'the one pre-norm has to add',
				description: 'With pre-norm nothing normalises the stream itself, so it arrives at the head still growing. One more norm before the unembedding fixes the scale the logits are computed from. GPT-2 added exactly this.',
				metricLabel: 'scale it removes', metric: s.last.toFixed( 2 ) + '×',
			};

			if ( u.kind === 'spine' ) return {
				category: 'residual stream',
				name: 'the highway',
				blurb: 'one d-vector, 2L writes',
				description: 'Every sub-layer in the model reads and writes this single vector. It is the only channel information has between blocks, and its scale is the thing normalisation exists to control.',
				metricLabel: 'writes at L = ' + layers, metric: String( s.subs ),
			};

			if ( u.kind === 'head' ) return {
				category: 'scale at the top',
				name: 'rms ' + s.last.toFixed( 2 ),
				blurb: mode === 'post' ? 'pinned by the norm' : '√(1 + 2L)',
				description: 'Attention logits are a dot product of two vectors on this scale, so they grow with its square. At this depth the logits going into softmax are about ' + s.logit.toFixed( 0 ) + '× what they would be at unit scale — enough to push softmax to a one-hot and the gradient to zero.',
				metricLabel: 'logit scale', metric: s.logit.toFixed( 0 ) + '×',
			};

			return null;

		},
		update( dt ) {

			flow = ( flow + dt * 0.22 ) % 1;
			const span = ( TOP + 0.9 ) - ( -TOP - 0.8 );
			packets.forEach( ( p, i ) => {

				const t = ( flow + i / packets.length ) % 1;
				p.position.set( 0, -TOP - 0.8 + t * span, 0 );
				p.scale.setScalar( mode === 'post' ? 1 : 0.75 + t * 1.1 );

			} );

		},
	};

}
