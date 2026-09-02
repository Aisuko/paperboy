import * as THREE from 'three';
import { addStandardLighting, createDeck, createLabel, THEME } from '../utils/sceneKit.js';
import { createStrip, createBar, setBar, tintBar, paintCell } from '../utils/tensorKit.js';
import { AGENTS, SHOWN, ranked, label, peersOf } from '../data/model.js';

const PH = [ -8.0, -4.0, 0, 4.0, 8.0 ];
const NAMES = [ 'propose', 'broadcast', 'ingest', 'revise', 'arbitrate' ];
const laneZ = ( i ) => ( i - ( AGENTS.length - 1 ) / 2 ) * 2.3;

const VIEWS = [
	{ position: new THREE.Vector3( -8.6, 4.2, 9.6 ), target: new THREE.Vector3( -7.2, 0, 0 ) },
	{ position: new THREE.Vector3( -3.8, 6.4, 8.4 ), target: new THREE.Vector3( -4.0, 0, 0 ) },
	{ position: new THREE.Vector3( 0.4, 4.0, 10.2 ), target: new THREE.Vector3( 0, 0, 0 ) },
	{ position: new THREE.Vector3( 4.6, 3.2, 9.0 ), target: new THREE.Vector3( 4.0, 0, 0 ) },
	{ position: new THREE.Vector3( 8.2, 4.0, 9.4 ), target: new THREE.Vector3( 8.6, 0, 0 ) },
	{ position: new THREE.Vector3( 0, 12.0, 15.0 ), target: new THREE.Vector3( 0.6, 0, 0 ) },
];

function arc( a, b, color ) {

	const mid = a.clone().add( b ).multiplyScalar( 0.5 );
	mid.y = 2.6;
	const curve = new THREE.QuadraticBezierCurve3( a, mid, b );
	const mesh = new THREE.Mesh(
		new THREE.TubeGeometry( curve, 22, 0.02, 5, false ),
		new THREE.MeshBasicMaterial( { color, transparent: true, opacity: 0.3 } ),
	);
	mesh.userData.curve = curve;
	return mesh;

}

export function buildScheduleWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene );
	scene.add( createDeck( 60, { y: -2.6, divisions: 60 } ) );

	const interactables = [];

	const gates = PH.map( ( x, i ) => {

		const group = new THREE.Group();
		group.position.x = x;

		const plate = new THREE.Mesh(
			new THREE.BoxGeometry( 0.12, 3.4, 9.6 ),
			new THREE.MeshStandardMaterial( { color: 0x0f1619, emissive: THEME.accent, emissiveIntensity: 0.06, roughness: 0.6, transparent: true, opacity: 0.5 } ),
		);
		plate.position.y = -0.6;
		group.add( plate );

		const name = createLabel( `${ i + 1 } · ${ NAMES[ i ] }`, 'label2d label2d-dim' );
		name.position.set( 0, 1.5, 0 );
		group.add( name );

		scene.add( group );
		return { group, plate, name };

	} );

	const lanes = AGENTS.map( ( agent, i ) => {

		const z = laneZ( i );

		const rail = new THREE.Mesh(
			new THREE.BoxGeometry( 18.4, 0.04, 0.06 ),
			new THREE.MeshBasicMaterial( { color: agent.color, transparent: true, opacity: 0.22 } ),
		);
		rail.position.set( 0, -2.3, z );
		scene.add( rail );

		const car = new THREE.Mesh(
			new THREE.BoxGeometry( 0.9, 0.5, 0.9 ),
			new THREE.MeshStandardMaterial( { color: 0x18222a, emissive: agent.color, emissiveIntensity: 0.5, roughness: 0.4, metalness: 0.3 } ),
		);
		car.position.set( PH[ 0 ], -2.0, z );
		car.userData.agent = i;
		scene.add( car );
		interactables.push( car );

		const bars = [];
		for ( let k = 0; k < 4; k ++ ) {

			const bar = createBar( { width: 0.15, depth: 0.15, color: agent.color } );
			bar.position.set( PH[ 0 ] + ( k - 1.5 ) * 0.22, -1.75, z );
			bar.userData.agent = i;
			bar.userData.slot = k;
			scene.add( bar );
			bars.push( bar );
			interactables.push( bar );

		}

		const strip = createStrip( { count: SHOWN.d, cell: 0.16, gap: 0.05, depth: 0.16, axis: 'x' } );
		strip.position.set( PH[ 3 ], -1.9, z );
		scene.add( strip );

		const name = createLabel( agent.name, 'label2d' );
		name.position.set( PH[ 0 ] - 1.5, -2.0, z );
		scene.add( name );

		const note = createLabel( '', 'label2d label2d-dim' );
		note.position.set( PH[ 3 ], -1.3, z );
		scene.add( note );

		return { car, bars, strip, note, z, agent };

	} );

	const arcs = [];
	for ( let a = 0; a < AGENTS.length; a ++ ) {

		for ( let b = 0; b < AGENTS.length; b ++ ) {

			if ( a === b ) continue;
			const mesh = arc(
				new THREE.Vector3( PH[ 1 ], -1.8, laneZ( a ) ),
				new THREE.Vector3( PH[ 2 ], -1.8, laneZ( b ) ),
				AGENTS[ a ].color,
			);
			mesh.userData.pair = [ a, b ];
			scene.add( mesh );
			arcs.push( mesh );

		}

	}

	const packets = arcs.map( ( a, i ) => {

		const mesh = new THREE.Mesh(
			new THREE.OctahedronGeometry( 0.1 ),
			new THREE.MeshStandardMaterial( { color: AGENTS[ a.userData.pair[ 0 ] ].color, emissive: AGENTS[ a.userData.pair[ 0 ] ].color, emissiveIntensity: 1.1 } ),
		);
		mesh.userData.t = ( i / arcs.length ) % 1;
		mesh.userData.arc = a;
		scene.add( mesh );
		return mesh;

	} );

	const barrier = new THREE.Mesh(
		new THREE.PlaneGeometry( 9.6, 3.0 ),
		new THREE.MeshBasicMaterial( { color: THEME.signal, transparent: true, opacity: 0.12, side: THREE.DoubleSide } ),
	);
	barrier.rotation.y = Math.PI / 2;
	barrier.position.set( PH[ 2 ], -1.0, 0 );
	scene.add( barrier );

	const barrierLabel = createLabel( 'barrier — every agent waits here', 'label2d label2d-dim' );
	barrierLabel.position.set( PH[ 2 ], 0.9, 0 );
	scene.add( barrierLabel );

	const pooledBars = [];
	for ( let k = 0; k < 4; k ++ ) {

		const bar = createBar( { width: 0.3, depth: 0.3, color: THEME.violet } );
		bar.position.set( PH[ 4 ] + ( k - 1.5 ) * 0.44, -2.2, 0 );
		bar.userData.pooled = k;
		scene.add( bar );
		pooledBars.push( bar );
		interactables.push( bar );

	}

	const pooledLabel = createLabel( '', 'label2d label2d-key' );
	pooledLabel.position.set( PH[ 4 ], 0.4, 0 );
	scene.add( pooledLabel );

	const gate = new THREE.Mesh(
		new THREE.BoxGeometry( 0.2, 2.0, 4.4 ),
		new THREE.MeshStandardMaterial( { color: 0x101619, emissive: THEME.accent, emissiveIntensity: 0.2, roughness: 0.5 } ),
	);
	gate.position.set( 10.6, -1.4, 0 );
	scene.add( gate );

	const gateLabel = createLabel( '', 'label2d label2d-key' );
	gateLabel.position.set( 10.6, 0.1, 0 );
	scene.add( gateLabel );

	let step = 0;
	let run = null;
	let round = 0;

	function current() { return run.rounds[ Math.min( round, run.rounds.length - 1 ) ]; }

	function render() {

		const rd = current();
		const phase = Math.min( step, 4 );

		gates.forEach( ( g, i ) => {

			const on = i === phase;
			g.plate.material.emissiveIntensity = on ? 0.4 : 0.05;
			g.plate.material.opacity = on ? 0.72 : 0.35;
			g.name.element.className = on ? 'label2d label2d-key' : 'label2d label2d-dim';

		} );

		lanes.forEach( ( lane, i ) => {

			const s = rd.per[ i ];
			lane.car.position.x = PH[ phase ];
			lane.car.material.emissiveIntensity = 0.25 + s.conf * 2.0;

			const top = ranked( s.p, 4 );
			lane.bars.forEach( ( bar, k ) => {

				bar.position.x = PH[ phase ] + ( k - 1.5 ) * 0.22;
				setBar( bar, Math.max( 0.02, ( top[ k ] ? top[ k ].p : 0 ) * 1.5 ) );
				bar.userData.token = top[ k ] ? top[ k ].v : -1;
				bar.userData.prob = top[ k ] ? top[ k ].p : 0;
				tintBar( bar, top[ k ] && top[ k ].v === 0 ? THEME.accent : lane.agent.color, k === 0 ? 0.85 : 0.3 );

			} );

			lane.strip.visible = step >= 3;
			lane.strip.userData.cells.forEach( ( c, d ) => paintCell( c, s.h[ d ], { gain: 0.35, dim: step !== 3 } ) );
			lane.note.visible = step === 1 || step === 3 || step === 4;
			if ( lane.note.visible ) lane.note.element.textContent = step === 3
				? `κ ${ lane.agent.anchor.toFixed( 2 ) } · λ ${ rd.lambda.toFixed( 3 ) }`
				: step === 1 ? `${ s.msg.length } ${ s.msg.length === 1 ? 'pair' : 'pairs' } · ${ s.msgBits.toFixed( 2 ) } bits`
					: `c ${ s.conf.toFixed( 3 ) } · H ${ s.H.toFixed( 2 ) }`;

		} );

		arcs.forEach( ( a ) => {

			const [ x, y ] = a.userData.pair;
			a.visible = step >= 1 && step <= 2 && peersOf( y, run.params.topology, AGENTS.length ).includes( x );
			a.material.opacity = step === 1 ? 0.6 : 0.25;

		} );
		packets.forEach( ( p ) => { p.visible = p.userData.arc.visible; } );

		barrier.visible = step === 2;
		barrierLabel.visible = step === 2;
		barrierLabel.element.textContent = 'barrier — no agent reads round r+1 while a peer is on round r';

		const top = ranked( rd.pooled, 4 );
		pooledBars.forEach( ( bar, k ) => {

			bar.visible = step >= 4;
			setBar( bar, Math.max( 0.02, ( top[ k ] ? top[ k ].p : 0 ) * 2.2 ) );
			bar.userData.token = top[ k ] ? top[ k ].v : -1;
			bar.userData.prob = top[ k ] ? top[ k ].p : 0;
			tintBar( bar, top[ k ] && top[ k ].v === 0 ? THEME.accent : THEME.violet, k === 0 ? 0.85 : 0.3 );

		} );
		pooledLabel.visible = step >= 4;
		pooledLabel.element.textContent = `${ run.params.mode } pool · JSD ${ rd.jsd.toFixed( 3 ) }`;

		const open = rd.jsd < run.params.eps;
		gate.visible = step === 5;
		gate.material.emissive.set( open ? THEME.accent : THEME.muted );
		gate.material.emissiveIntensity = open ? 0.6 : 0.1;
		gateLabel.visible = step === 5;
		gateLabel.element.textContent = open
			? `publish "${ label( rd.top ) }" — JSD ${ rd.jsd.toFixed( 3 ) } < ε ${ run.params.eps.toFixed( 2 ) }`
			: `hold — JSD ${ rd.jsd.toFixed( 3 ) } ≥ ε ${ run.params.eps.toFixed( 2 ) }`;
		gateLabel.element.className = open ? 'label2d label2d-key' : 'label2d label2d-dim';

	}

	return {
		scene,
		interactables,
		getStepView( i ) { return VIEWS[ Math.max( 0, Math.min( VIEWS.length - 1, i ) ) ]; },
		setRun( next ) { run = next; round = Math.min( round, run.rounds.length - 1 ); render(); },
		setRound( r ) { round = r; if ( run ) render(); },
		setStep( i ) { step = i; if ( run ) render(); },
		describe( object ) {

			const u = object.userData;
			const rd = current();

			if ( u.pooled !== undefined ) return {
				category: 'orchestrator',
				name: u.token >= 0 ? `pooled "${ label( u.token ) }"` : 'pooled slot',
				blurb: `${ run.params.mode } pool at round ${ rd.r }`,
				description: `Phase 5 pools the four distributions with weights c ∝ 1/(H + 0.2), capped at ${ run.params.cap.toFixed( 2 ) } so no member carries a round on its own.`,
				metricLabel: 'pooled probability',
				metric: u.prob.toFixed( 4 ),
			};

			const agent = AGENTS[ u.agent ];
			const s = rd.per[ u.agent ];

			if ( u.slot !== undefined ) return {
				category: `${ agent.name } · lane ${ u.agent + 1 }`,
				name: `"${ label( u.token ) }"`,
				blurb: `rank ${ u.slot + 1 } at round ${ rd.r }`,
				description: `Its packet this round carries ${ s.msg.length } ${ s.msg.length === 1 ? 'pair' : 'pairs' } worth ${ s.msgMass.toFixed( 3 ) } of the raw mass, and reaches ${ peersOf( u.agent, run.params.topology, AGENTS.length ).length } peer${ peersOf( u.agent, run.params.topology, AGENTS.length ).length === 1 ? '' : 's' } under ${ run.params.topology }.`,
				metricLabel: 'probability',
				metric: u.prob.toFixed( 4 ),
			};

			return {
				category: `lane ${ u.agent + 1 } of ${ AGENTS.length }`,
				name: agent.name,
				blurb: agent.role,
				description: `${ agent.blurb } Temperature ${ agent.temp.toFixed( 2 ) }, anchor κ ${ agent.anchor.toFixed( 2 ) }. At round ${ rd.r } the peer vector it ingests is scaled by λ ${ rd.lambda.toFixed( 3 ) } × κ ${ agent.anchor.toFixed( 2 ) }.`,
				metricLabel: 'pooling weight',
				metric: s.conf.toFixed( 3 ),
			};

		},
		update( dt ) {

			packets.forEach( ( p ) => {

				if ( ! p.visible ) return;
				p.userData.t = ( p.userData.t + dt * 0.5 ) % 1;
				p.position.copy( p.userData.arc.userData.curve.getPoint( p.userData.t ) );
				p.rotation.y += dt * 2.4;

			} );

		},
	};

}
