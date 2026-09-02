import * as THREE from 'three';
import { addStandardLighting, createDeck, createLabel, THEME } from '../utils/sceneKit.js';
import { createBar, setBar, tintBar } from '../utils/tensorKit.js';
import { AGENTS, QUESTION, ORCH, label, ranked, peersOf } from '../data/model.js';

const R = 4.6;
const TOP = 2.4;

const VIEWS = [
	{ position: new THREE.Vector3( 0, 7.4, 16.5 ), target: new THREE.Vector3( 0, 0.6, 0 ) },
	{ position: new THREE.Vector3( 0, 3.4, 13.0 ), target: new THREE.Vector3( 0, 1.6, 0 ) },
	{ position: new THREE.Vector3( 0, 9.6, 10.5 ), target: new THREE.Vector3( 0, 0.8, 0 ) },
	{ position: new THREE.Vector3( -8.4, 5.2, 9.4 ), target: new THREE.Vector3( 0, 0.8, 0 ) },
	{ position: new THREE.Vector3( 0, 4.0, 15.0 ), target: new THREE.Vector3( 0, 0.4, -3.4 ) },
];

function pillarAt( i ) {

	const a = Math.PI * ( 0.25 + i * 0.5 );
	return new THREE.Vector3( Math.cos( a ) * R, 0, Math.sin( a ) * R );

}

function arcMesh( a, b, color ) {

	const mid = a.clone().add( b ).multiplyScalar( 0.5 );
	mid.y = TOP + 1.5;
	const curve = new THREE.QuadraticBezierCurve3( a, mid, b );
	const mesh = new THREE.Mesh(
		new THREE.TubeGeometry( curve, 24, 0.018, 5, false ),
		new THREE.MeshBasicMaterial( { color, transparent: true, opacity: 0.28 } ),
	);
	mesh.userData.curve = curve;
	return mesh;

}

export function buildFloorWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene );
	scene.add( createDeck( 70, { y: -2.2, divisions: 70 } ) );

	const interactables = [];
	const pillars = [];

	AGENTS.forEach( ( agent, i ) => {

		const group = new THREE.Group();
		const pos = pillarAt( i );
		group.position.copy( pos );

		const body = new THREE.Mesh(
			new THREE.CylinderGeometry( 0.62, 0.78, TOP, 6 ),
			new THREE.MeshStandardMaterial( { color: 0x182126, emissive: agent.color, emissiveIntensity: 0.12, roughness: 0.5, metalness: 0.35 } ),
		);
		body.position.y = TOP / 2 - 2.2;
		body.userData.agent = i;
		group.add( body );
		interactables.push( body );

		const cap = new THREE.Mesh(
			new THREE.CylinderGeometry( 0.66, 0.66, 0.07, 6 ),
			new THREE.MeshStandardMaterial( { color: agent.color, emissive: agent.color, emissiveIntensity: 0.7 } ),
		);
		cap.position.y = TOP - 2.2;
		cap.userData.agent = i;
		group.add( cap );
		interactables.push( cap );

		const bars = [];
		for ( let k = 0; k < 4; k ++ ) {

			const bar = createBar( { width: 0.17, depth: 0.17, color: agent.color } );
			bar.position.set( ( k - 1.5 ) * 0.24, TOP - 2.15, 0 );
			bar.userData.agent = i;
			bar.userData.slot = k;
			group.add( bar );
			bars.push( bar );
			interactables.push( bar );

		}

		const name = createLabel( agent.name, 'label2d' );
		name.position.set( 0, -1.55, 0 );
		group.add( name );

		const belief = createLabel( '', 'label2d label2d-dim' );
		belief.position.set( 0, TOP - 0.9, 0 );
		group.add( belief );

		scene.add( group );
		pillars.push( { group, body, cap, bars, name, belief, pos } );

	} );

	const arcs = [];
	for ( let a = 0; a < AGENTS.length; a ++ ) {

		for ( let b = 0; b < AGENTS.length; b ++ ) {

			if ( a === b ) continue;
			const from = pillarAt( a ).setY( TOP - 2.0 );
			const to = pillarAt( b ).setY( TOP - 2.0 );
			const mesh = arcMesh( from, to, AGENTS[ a ].color );
			mesh.userData.pair = [ a, b ];
			scene.add( mesh );
			arcs.push( mesh );

		}

	}

	const packets = arcs.map( ( arc, i ) => {

		const mesh = new THREE.Mesh(
			new THREE.OctahedronGeometry( 0.11 ),
			new THREE.MeshStandardMaterial( { color: AGENTS[ arc.userData.pair[ 0 ] ].color, emissive: AGENTS[ arc.userData.pair[ 0 ] ].color, emissiveIntensity: 1.1 } ),
		);
		mesh.userData.t = ( i / arcs.length ) % 1;
		mesh.userData.arc = arc;
		scene.add( mesh );
		return mesh;

	} );

	const hub = new THREE.Group();
	scene.add( hub );

	const ring = new THREE.Mesh(
		new THREE.TorusGeometry( 1.75, 0.035, 8, 96 ),
		new THREE.MeshStandardMaterial( { color: THEME.accent, emissive: THEME.accent, emissiveIntensity: 0.8 } ),
	);
	ring.rotation.x = -Math.PI / 2;
	ring.position.y = -1.9;
	hub.add( ring );

	const dial = new THREE.Mesh(
		new THREE.TorusGeometry( 1.4, 0.06, 8, 96, Math.PI * 1.4 ),
		new THREE.MeshStandardMaterial( { color: THEME.signal, emissive: THEME.signal, emissiveIntensity: 0.9 } ),
	);
	dial.rotation.x = -Math.PI / 2;
	dial.position.y = -1.85;
	hub.add( dial );

	const pooledBars = [];
	for ( let k = 0; k < 4; k ++ ) {

		const bar = createBar( { width: 0.3, depth: 0.3, color: THEME.accent } );
		bar.position.set( ( k - 1.5 ) * 0.42, -1.8, 0 );
		bar.userData.pooled = k;
		hub.add( bar );
		pooledBars.push( bar );
		interactables.push( bar );

	}

	const hubLabel = createLabel( '', 'label2d label2d-key' );
	hubLabel.position.set( 0, 0.85, 0 );
	hub.add( hubLabel );

	const jsdLabel = createLabel( '', 'label2d label2d-dim' );
	jsdLabel.position.set( 0, -1.95, 2.15 );
	hub.add( jsdLabel );

	const plinth = new THREE.Mesh(
		new THREE.BoxGeometry( 8.4, 0.22, 1.5 ),
		new THREE.MeshStandardMaterial( { color: 0x121a1e, emissive: THEME.info, emissiveIntensity: 0.12, roughness: 0.6 } ),
	);
	plinth.position.set( 0, -2.05, 8.2 );
	scene.add( plinth );

	const qLabel = createLabel( QUESTION, 'label2d' );
	qLabel.position.set( 0, -1.7, 8.2 );
	scene.add( qLabel );

	const gate = new THREE.Mesh(
		new THREE.BoxGeometry( 5.2, 1.5, 0.18 ),
		new THREE.MeshStandardMaterial( { color: 0x101619, emissive: THEME.accent, emissiveIntensity: 0.2, roughness: 0.5, transparent: true, opacity: 0.9 } ),
	);
	gate.position.set( 0, -1.2, -8.2 );
	scene.add( gate );

	const gateLabel = createLabel( '', 'label2d label2d-key' );
	gateLabel.position.set( 0, -0.2, -8.2 );
	scene.add( gateLabel );

	let step = 0;
	let run = null;
	let roundIndex = 0;

	function cur() { return run.rounds[ Math.min( roundIndex, run.rounds.length - 1 ) ]; }

	function render() {

		const round = cur();

		round.per.forEach( ( state, i ) => {

			const top = ranked( state.p, 4 );
			const peak = top[ 0 ].p;
			pillars[ i ].bars.forEach( ( bar, k ) => {

				setBar( bar, Math.max( 0.02, ( top[ k ] ? top[ k ].p : 0 ) * 1.9 ) );
				bar.userData.token = top[ k ] ? top[ k ].v : -1;
				bar.userData.prob = top[ k ] ? top[ k ].p : 0;
				const isAnswer = top[ k ] && top[ k ].v === 0;
				tintBar( bar, isAnswer ? THEME.accent : AGENTS[ i ].color, k === 0 ? 0.9 : 0.35 );

			} );
			pillars[ i ].belief.element.textContent = `${ label( state.top ) }  ${ peak.toFixed( 2 ) }`;
			pillars[ i ].cap.material.emissiveIntensity = 0.4 + state.conf * 2.2;

		} );

		arcs.forEach( ( arc ) => {

			const [ a, b ] = arc.userData.pair;
			const live = peersOf( b, run.params.topology, AGENTS.length ).includes( a );
			arc.visible = live;
			arc.material.opacity = step === 2 ? 0.55 : 0.22;

		} );
		packets.forEach( ( p ) => { p.visible = p.userData.arc.visible && step >= 2; } );

		const top = ranked( round.pooled, 4 );
		pooledBars.forEach( ( bar, k ) => {

			setBar( bar, Math.max( 0.02, ( top[ k ] ? top[ k ].p : 0 ) * 2.4 ) );
			bar.userData.token = top[ k ] ? top[ k ].v : -1;
			bar.userData.prob = top[ k ] ? top[ k ].p : 0;
			tintBar( bar, top[ k ] && top[ k ].v === 0 ? THEME.accent : THEME.violet, k === 0 ? 0.85 : 0.3 );

		} );

		hubLabel.element.textContent = `round ${ round.r } / ${ run.params.budget }  ·  ${ run.params.mode } pool`;
		jsdLabel.element.textContent = `JSD ${ round.jsd.toFixed( 3 ) }  ·  ε ${ run.params.eps.toFixed( 2 ) }`;

		const open = round.jsd < run.params.eps;
		dial.scale.setScalar( 1 );
		dial.rotation.z = -Math.PI * Math.min( 1, round.jsd / 0.4 ) * 1.4;
		dial.material.color.set( open ? THEME.accent : THEME.signal );
		dial.material.emissive.set( open ? THEME.accent : THEME.signal );

		gate.material.emissive.set( open ? THEME.accent : THEME.muted );
		gate.material.emissiveIntensity = open ? 0.55 : 0.1;
		gateLabel.element.textContent = open ? `published "${ label( round.top ) }"   p ${ Math.max( ...round.pooled ).toFixed( 3 ) }` : 'gate closed — council still split';
		gateLabel.element.className = open ? 'label2d label2d-key' : 'label2d label2d-dim';

	}

	return {
		scene,
		interactables,
		getStepView( i ) { return VIEWS[ Math.max( 0, Math.min( VIEWS.length - 1, i ) ) ]; },
		setRun( next ) {

			run = next;
			roundIndex = Math.min( roundIndex, run.rounds.length - 1 );
			render();

		},
		setRound( r ) {

			roundIndex = Math.max( 0, Math.min( r, run.rounds.length - 1 ) );
			render();

		},
		setStep( i ) {

			step = i;
			if ( run ) render();

		},
		getRound() { return roundIndex; },
		describe( object ) {

			const u = object.userData;

			if ( u.pooled !== undefined ) return {
				category: 'arbiter',
				name: u.token >= 0 ? `pooled "${ label( u.token ) }"` : 'pooled slot',
				blurb: `${ run.params.mode } pool over ${ AGENTS.length } agents`,
				description: `Rank ${ u.pooled + 1 } of the pooled distribution at round ${ cur().r }. Pooling weights are inverse entropy, capped so no single agent carries a round.`,
				metricLabel: 'pooled probability',
				metric: u.prob.toFixed( 4 ),
			};

			const agent = AGENTS[ u.agent ];
			const state = cur().per[ u.agent ];

			if ( u.slot !== undefined ) return {
				category: agent.name,
				name: `"${ label( u.token ) }"`,
				blurb: `rank ${ u.slot + 1 } at round ${ cur().r }`,
				description: `${ agent.role }. Temperature ${ agent.temp.toFixed( 2 ) }, anchor ${ agent.anchor.toFixed( 2 ) }. Its packet this round carries ${ state.msg.length } token/probability ${ state.msg.length === 1 ? 'pair' : 'pairs' }.`,
				metricLabel: 'probability',
				metric: u.prob.toFixed( 4 ),
			};

			return {
				category: `agent ${ u.agent + 1 } of ${ AGENTS.length }`,
				name: agent.name,
				blurb: agent.role,
				description: `${ agent.blurb } At round ${ cur().r } it believes "${ label( state.top ) }" at ${ Math.max( ...state.p ).toFixed( 3 ) }, with entropy ${ state.H.toFixed( 3 ) } nats over ${ ORCH.vocab.toLocaleString( 'en-AU' ) } tokens.`,
				metricLabel: 'pooling weight',
				metric: state.conf.toFixed( 3 ),
			};

		},
		update( dt ) {

			ring.rotation.z += dt * 0.25;
			packets.forEach( ( p ) => {

				if ( ! p.visible ) return;
				p.userData.t = ( p.userData.t + dt * 0.35 ) % 1;
				p.position.copy( p.userData.arc.userData.curve.getPoint( p.userData.t ) );
				p.rotation.y += dt * 2.2;

			} );

		},
	};

}
