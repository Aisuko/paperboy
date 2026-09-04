import * as THREE from 'three';
import { addStandardLighting, createDeck, createLabel, THEME } from '../utils/sceneKit.js';
import { createRail, createFrame } from '../utils/tensorKit.js';
import { polyline } from '../utils/barKit.js';
import { ACTS, BY_ACT, geluTanh } from '../data/acts.js';

const X_MIN = -4;
const X_MAX = 4;
const KX = 1.15;
const KY = 0.92;
const SAMPLES = 160;

const px = ( x ) => x * KX;
const py = ( y ) => y * KY;

const PLANES = { relu: -1.35, gelu: -0.45, swish: 0.45, selu: 1.35 };

const VIEWS = [
	{ position: new THREE.Vector3( -0.4, 1.1, 20 ), target: new THREE.Vector3( -0.4, 0.9, 0 ) },
	{ position: new THREE.Vector3( 0, 1.0, 16 ), target: new THREE.Vector3( 0, 0.8, 0 ) },
	{ position: new THREE.Vector3( 0, 1.0, 16 ), target: new THREE.Vector3( 0, 0.8, 0 ) },
	{ position: new THREE.Vector3( 0, 1.0, 16 ), target: new THREE.Vector3( 0, 0.8, 0 ) },
	{ position: new THREE.Vector3( 0, 1.0, 16 ), target: new THREE.Vector3( 0, 0.8, 0 ) },
	{ position: new THREE.Vector3( -7.5, 4.6, 17 ), target: new THREE.Vector3( 0, 0.8, 0 ) },
];

export function buildActivationWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene );
	scene.add( createDeck( 70, { y: -4.6, divisions: 70 } ) );

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

	rig.add( createRail( new THREE.Vector3( px( X_MIN ), 0, 0 ), new THREE.Vector3( px( X_MAX ), 0, 0 ), { opacity: 0.6 } ) );
	rig.add( createRail( new THREE.Vector3( 0, py( -1.9 ), 0 ), new THREE.Vector3( 0, py( 4.2 ), 0 ), { opacity: 0.6 } ) );

	[ -4, -2, 2, 4 ].forEach( ( x ) => {

		const t = createLabel( String( x ), 'label2d label2d-dim' );
		t.position.set( px( x ), -0.4, 0 );
		rig.add( t );

	} );

	[ 1, 2, 4 ].forEach( ( y ) => {

		const t = createLabel( String( y ), 'label2d label2d-dim' );
		t.position.set( -0.42, py( y ), 0 );
		rig.add( t );

	} );

	const identity = polyline(
		[ new THREE.Vector3( px( -1.4 ), py( -1.4 ), 0 ), new THREE.Vector3( px( 4.2 ), py( 4.2 ), 0 ) ],
		THEME.muted, 0.5,
	);
	rig.add( identity );
	label( 'identity', 'y = x', 'label2d label2d-dim', px( 3.5 ), py( 4.0 ) );

	const curves = ACTS.map( ( act ) => {

		const z = PLANES[ act.key ];
		const line = polyline( [], act.color );
		line.position.z = z;
		rig.add( line );

		const deriv = polyline( [], act.color, 0.4 );
		deriv.position.z = z;
		deriv.visible = false;
		rig.add( deriv );

		const dot = new THREE.Mesh(
			new THREE.SphereGeometry( 0.13, 18, 12 ),
			new THREE.MeshStandardMaterial( { color: act.color, emissive: act.color, emissiveIntensity: 0.95 } ),
		);
		dot.position.z = z;
		dot.userData = { kind: 'probe', act: act.key };
		rig.add( dot );

		const tile = new THREE.Mesh(
			new THREE.BoxGeometry( 1.4, 0.42, 0.24 ),
			new THREE.MeshStandardMaterial( { color: act.color, emissive: act.color, emissiveIntensity: 0.5, roughness: 0.4 } ),
		);
		tile.position.set( px( X_MIN ) - 1.3, py( 3.6 ) - ( ACTS.indexOf( act ) ) * 0.62, z );
		tile.userData = { kind: 'tile', act: act.key };
		rig.add( tile );

		const tag = createLabel( act.label, 'label2d label2d-key' );
		tag.position.set( 0, 0.44, 0 );
		tile.add( tag );

		const cap = createLabel( '', 'label2d label2d-dim' );
		cap.position.set( 0, 0.32, 0 );
		dot.add( cap );

		interactables.push( dot, tile );
		return { act, line, deriv, dot, tile, cap, z };

	} );

	const approx = polyline( [], THEME.rose, 0.85 );
	approx.position.z = PLANES.gelu + 0.02;
	approx.visible = false;
	rig.add( approx );
	label( 'approx', '', 'label2d label2d-dim', px( 2.6 ), py( 3.1 ), PLANES.gelu );

	const probeLine = polyline( [ new THREE.Vector3( 0, py( -1.9 ), 0 ), new THREE.Vector3( 0, py( 4.2 ), 0 ) ], THEME.signal, 0.6 );
	rig.add( probeLine );
	label( 'probe', '', 'label2d label2d-key', 0, py( -1.7 ) );

	const frame = createFrame( px( X_MAX - X_MIN ) + 1.2, py( 5.6 ) + 0.8 );
	frame.position.set( 0, py( 1.4 ), -2.0 );
	rig.add( frame );

	label( 'axisX', 'pre-activation x', 'label2d label2d-dim', px( 3.2 ), -0.85 );

	let step = 0;
	let beta = 1;
	let probe = 1.2;
	let focus = 'gelu';
	let showDeriv = false;

	const valueOf = ( act, x ) => act.key === 'swish' ? act.f( x, beta ) : act.f( x );
	const slopeOf = ( act, x ) => act.key === 'swish' ? act.d( x, beta ) : act.d( x );

	function state() {

		const rows = ACTS.map( ( a ) => ( { act: a, y: valueOf( a, probe ), dy: slopeOf( a, probe ) } ) );
		const g = BY_ACT.gelu;
		return {
			probe, beta, focus, showDeriv, rows,
			active: BY_ACT[ focus ],
			activeY: valueOf( BY_ACT[ focus ], probe ),
			activeD: slopeOf( BY_ACT[ focus ], probe ),
			approxErr: Math.abs( geluTanh( probe ) - g.f( probe ) ),
		};

	}

	function rebuild() {

		curves.forEach( ( c ) => {

			const pts = [];
			const dts = [];
			for ( let i = 0; i <= SAMPLES; i ++ ) {

				const x = X_MIN + ( X_MAX - X_MIN ) * i / SAMPLES;
				pts.push( new THREE.Vector3( px( x ), py( valueOf( c.act, x ) ), 0 ) );
				dts.push( new THREE.Vector3( px( x ), py( slopeOf( c.act, x ) ), 0 ) );

			}

			c.line.geometry.dispose();
			c.line.geometry = new THREE.BufferGeometry().setFromPoints( pts );
			c.deriv.geometry.dispose();
			c.deriv.geometry = new THREE.BufferGeometry().setFromPoints( dts );

		} );

		const ap = [];
		for ( let i = 0; i <= SAMPLES; i ++ ) {

			const x = X_MIN + ( X_MAX - X_MIN ) * i / SAMPLES;
			ap.push( new THREE.Vector3( px( x ), py( geluTanh( x ) ), 0 ) );

		}
		approx.geometry.dispose();
		approx.geometry = new THREE.BufferGeometry().setFromPoints( ap );

		render();

	}

	function render() {

		const s = state();

		curves.forEach( ( c ) => {

			const on = c.act.key === focus;
			const lit = step === 0 || step === 5 || on;
			c.line.material.opacity = lit ? 0.95 : 0.2;
			c.dot.visible = lit;
			c.tile.material.emissiveIntensity = on ? 0.95 : 0.22;
			c.deriv.visible = showDeriv && on;

			const y = valueOf( c.act, probe );
			c.dot.position.set( px( probe ), py( y ), c.z );
			c.cap.element.textContent = on ? `${ c.act.label }(${ probe.toFixed( 2 ) }) = ${ y.toFixed( 3 ) }` : '';

		} );

		approx.visible = step === 2 && focus === 'gelu';
		labels.approx.element.textContent = approx.visible ? `tanh form · error ${ s.approxErr.toExponential( 1 ) }` : '';

		probeLine.position.x = px( probe );
		labels.probe.element.textContent = `x = ${ probe.toFixed( 2 ) }`;
		labels.probe.position.set( px( probe ), py( -1.7 ), 0 );

		identity.material.opacity = step === 0 ? 0.75 : 0.3;

	}

	rebuild();

	return {
		scene,
		interactables,
		getStepView( i ) { return VIEWS[ i ]; },
		getState: state,
		setStep( i ) { step = i; render(); },
		setFocus( key ) { focus = key; render(); return state(); },
		setProbe( v ) { probe = v; render(); return state(); },
		setBeta( v ) { beta = v; rebuild(); return state(); },
		setDeriv( on ) { showDeriv = on; render(); return state(); },
		describe( object ) {

			const u = object.userData;
			const act = BY_ACT[ u.act ];
			const y = valueOf( act, probe );
			const d = slopeOf( act, probe );

			return {
				category: `${ act.users }`,
				name: act.label,
				blurb: act.expr,
				description: act.note,
				metricLabel: `at x = ${ probe.toFixed( 2 ) }`,
				metric: `${ y.toFixed( 4 ) }   ·   slope ${ d.toFixed( 4 ) }   ·   ${ act.flops } FLOPs`,
			};

		},
		update() {},
	};

}
