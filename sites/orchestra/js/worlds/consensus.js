import * as THREE from 'three';
import { addStandardLighting, createDeck, createLabel, THEME } from '../utils/sceneKit.js';
import { createBar, setBar, tintBar } from '../utils/tensorKit.js';
import { AGENTS, DEFAULTS, ranked, label } from '../data/model.js';

const MAX_R = DEFAULTS.budget + 1;
const SLOTS = 4;
const roundX = ( r ) => ( r - ( MAX_R - 1 ) / 2 ) * 1.25;
const laneZ = ( a ) => ( a - ( AGENTS.length - 1 ) / 2 ) * 0.95;
const POOL_Z = laneZ( AGENTS.length - 1 ) + 1.3;
const JSD_Y = 1.2;

const VIEWS = [
	{ position: new THREE.Vector3( -3.3, 4.0, 10.4 ), target: new THREE.Vector3( -3.1, 0.4, 0 ) },
	{ position: new THREE.Vector3( -2.0, 3.8, 10.2 ), target: new THREE.Vector3( -1.85, 0.4, 0 ) },
	{ position: new THREE.Vector3( -0.7, 3.8, 10.2 ), target: new THREE.Vector3( -0.6, 0.4, 0 ) },
	{ position: new THREE.Vector3( 0.6, 3.8, 10.2 ), target: new THREE.Vector3( 0.6, 0.4, 0 ) },
	{ position: new THREE.Vector3( 1.9, 4.2, 10.6 ), target: new THREE.Vector3( 1.85, 0.4, 0 ) },
	{ position: new THREE.Vector3( 0.2, 8.4, 15.2 ), target: new THREE.Vector3( 0.2, 0.6, 0 ) },
];

export function buildConsensusWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene );
	scene.add( createDeck( 60, { y: -2.4, divisions: 60 } ) );

	const interactables = [];

	AGENTS.forEach( ( agent, a ) => {

		const name = createLabel( agent.name, 'label2d' );
		name.position.set( roundX( 0 ) - 0.95, -2.1, laneZ( a ) );
		scene.add( name );

	} );

	const poolName = createLabel( 'pooled', 'label2d label2d-key' );
	poolName.position.set( roundX( 0 ) - 0.95, -2.1, POOL_Z );
	scene.add( poolName );

	const columns = [];

	for ( let r = 0; r < MAX_R; r ++ ) {

		const group = new THREE.Group();
		group.position.x = roundX( r );

		const floor = new THREE.Mesh(
			new THREE.BoxGeometry( 0.95, 0.025, 5.7 ),
			new THREE.MeshStandardMaterial( { color: 0x0e1518, emissive: THEME.accent, emissiveIntensity: 0.05, roughness: 0.7, transparent: true, opacity: 0.6 } ),
		);
		floor.position.set( 0, -2.32, 0.5 );
		group.add( floor );

		const head = createLabel( `r ${ r }`, 'label2d label2d-dim' );
		head.position.set( 0, -2.2, POOL_Z + 0.9 );
		group.add( head );

		const cells = [];

		for ( let a = 0; a < AGENTS.length; a ++ ) {

			for ( let k = 0; k < SLOTS; k ++ ) {

				const bar = createBar( { width: 0.095, depth: 0.095, color: AGENTS[ a ].color } );
				bar.position.set( ( k - ( SLOTS - 1 ) / 2 ) * 0.13, -2.28, laneZ( a ) );
				bar.userData.round = r;
				bar.userData.agent = a;
				bar.userData.slot = k;
				group.add( bar );
				cells.push( bar );
				interactables.push( bar );

			}

		}

		const pooled = [];
		for ( let k = 0; k < SLOTS; k ++ ) {

			const bar = createBar( { width: 0.13, depth: 0.13, color: THEME.violet } );
			bar.position.set( ( k - ( SLOTS - 1 ) / 2 ) * 0.17, -2.28, POOL_Z );
			bar.userData.round = r;
			bar.userData.pooled = k;
			group.add( bar );
			pooled.push( bar );
			interactables.push( bar );

		}

		const jsdNode = new THREE.Mesh(
			new THREE.SphereGeometry( 0.05, 12, 12 ),
			new THREE.MeshStandardMaterial( { color: THEME.signal, emissive: THEME.signal, emissiveIntensity: 0.9 } ),
		);
		jsdNode.position.set( 0, JSD_Y, POOL_Z + 0.5 );
		group.add( jsdNode );

		const jsdLabel = createLabel( '', 'label2d label2d-dim' );
		jsdLabel.position.set( 0, JSD_Y + 0.21, POOL_Z + 0.5 );
		group.add( jsdLabel );

		scene.add( group );
		columns.push( { group, floor, head, cells, pooled, jsdNode, jsdLabel } );

	}

	const trail = new THREE.Line(
		new THREE.BufferGeometry().setFromPoints( columns.map( ( c ) => new THREE.Vector3( c.group.position.x, JSD_Y, POOL_Z + 1.0 ) ) ),
		new THREE.LineBasicMaterial( { color: THEME.signal, transparent: true, opacity: 0.7 } ),
	);
	scene.add( trail );

	const epsPlane = new THREE.Mesh(
		new THREE.PlaneGeometry( 7.7, 0.02 ),
		new THREE.MeshBasicMaterial( { color: THEME.accent, transparent: true, opacity: 0.6, side: THREE.DoubleSide } ),
	);
	epsPlane.position.set( 0, JSD_Y, POOL_Z + 0.5 );
	scene.add( epsPlane );

	const epsLabel = createLabel( '', 'label2d label2d-key' );
	epsLabel.position.set( roundX( MAX_R - 1 ) + 1.1, JSD_Y, POOL_Z + 0.5 );
	scene.add( epsLabel );

	const verdict = createLabel( '', 'label2d label2d-key' );
	verdict.position.set( 0, 1.95, POOL_Z + 0.5 );
	scene.add( verdict );

	let run = null;
	let round = 0;

	function jsdY( v ) { return JSD_Y + ( v - run.params.eps ) * 2.2; }

	function render() {

		const pos = trail.geometry.attributes.position;

		columns.forEach( ( col, r ) => {

			const rd = run.rounds[ r ];
			const live = Boolean( rd );
			col.group.visible = live;
			pos.setY( r, live ? jsdY( rd.jsd ) : JSD_Y );
			if ( ! live ) return;

			const active = r === Math.min( round, run.rounds.length - 1 );
			col.floor.material.emissiveIntensity = active ? 0.35 : 0.04;
			col.floor.material.opacity = active ? 0.85 : 0.45;
			col.head.element.className = active ? 'label2d label2d-key' : 'label2d label2d-dim';

			rd.per.forEach( ( s, a ) => {

				const top = ranked( s.p, SLOTS );
				for ( let k = 0; k < SLOTS; k ++ ) {

					const bar = col.cells[ a * SLOTS + k ];
					const t = top[ k ];
					setBar( bar, Math.max( 0.02, ( t ? t.p : 0 ) * 1.7 ) );
					bar.userData.token = t ? t.v : -1;
					bar.userData.prob = t ? t.p : 0;
					const answer = t && t.v === 0;
					tintBar( bar, answer ? THEME.accent : AGENTS[ a ].color, ( active ? 1 : 0.35 ) * ( k === 0 ? 0.85 : 0.28 ) );

				}

			} );

			const top = ranked( rd.pooled, SLOTS );
			col.pooled.forEach( ( bar, k ) => {

				const t = top[ k ];
				setBar( bar, Math.max( 0.02, ( t ? t.p : 0 ) * 2.1 ) );
				bar.userData.token = t ? t.v : -1;
				bar.userData.prob = t ? t.p : 0;
				tintBar( bar, t && t.v === 0 ? THEME.accent : THEME.violet, ( active ? 1 : 0.35 ) * ( k === 0 ? 0.85 : 0.28 ) );

			} );

			const under = rd.jsd < run.params.eps;
			col.jsdNode.position.y = jsdY( rd.jsd );
			col.jsdNode.material.color.set( under ? THEME.accent : THEME.signal );
			col.jsdNode.material.emissive.set( under ? THEME.accent : THEME.signal );
			col.jsdLabel.position.y = jsdY( rd.jsd ) + 0.42;
			col.jsdLabel.element.textContent = rd.jsd.toFixed( 3 );
			col.jsdLabel.element.className = active ? 'label2d label2d-key' : 'label2d label2d-dim';

		} );

		pos.needsUpdate = true;
		trail.geometry.setDrawRange( 0, run.rounds.length );
		trail.geometry.computeBoundingSphere();

		epsLabel.element.textContent = `ε ${ run.params.eps.toFixed( 2 ) }`;
		verdict.element.textContent = run.published
			? `stopped at round ${ run.stoppedAt } — published "${ label( run.final.top ) }"${ run.correct ? '' : ' (wrong)' }`
			: `budget exhausted at round ${ run.stoppedAt } — withheld, JSD ${ run.final.jsd.toFixed( 3 ) }`;
		verdict.element.className = run.published && run.correct ? 'label2d label2d-key' : 'label2d label2d-dim';

	}

	return {
		scene,
		interactables,
		getStepView( i ) { return VIEWS[ Math.max( 0, Math.min( VIEWS.length - 1, i ) ) ]; },
		setRun( next ) { run = next; render(); },
		setRound( r ) { round = r; if ( run ) render(); },
		setStep( i ) { round = i; if ( run ) render(); },
		describe( object ) {

			const u = object.userData;
			const rd = run.rounds[ u.round ];
			if ( ! rd ) return null;

			if ( u.pooled !== undefined ) return {
				category: `pooled · round ${ rd.r }`,
				name: u.token >= 0 ? `"${ label( u.token ) }"` : 'empty slot',
				blurb: `${ run.params.mode } pool · JSD ${ rd.jsd.toFixed( 3 ) }`,
				description: rd.jsd < run.params.eps
					? `This round is under ε ${ run.params.eps.toFixed( 2 ) }, so the orchestrator publishes here and spends none of its remaining budget.`
					: `Still ${ ( rd.jsd - run.params.eps ).toFixed( 3 ) } above ε. The council keeps arguing.`,
				metricLabel: 'pooled probability',
				metric: u.prob.toFixed( 4 ),
			};

			const s = rd.per[ u.agent ];

			return {
				category: `${ AGENTS[ u.agent ].name } · round ${ rd.r }`,
				name: u.token >= 0 ? `"${ label( u.token ) }"` : 'empty slot',
				blurb: `rank ${ u.slot + 1 } · H ${ s.H.toFixed( 3 ) } nats`,
				description: `Pooling weight ${ s.conf.toFixed( 3 ) }, packet of ${ s.msg.length } ${ s.msg.length === 1 ? 'pair' : 'pairs' }. Peer influence entering the next round is λ ${ rd.lambda.toFixed( 3 ) } × κ ${ AGENTS[ u.agent ].anchor.toFixed( 2 ) }.`,
				metricLabel: 'probability',
				metric: u.prob.toFixed( 4 ),
			};

		},
		update( dt ) {

			columns.forEach( ( c ) => { if ( c.group.visible ) c.jsdNode.rotation.y += dt; } );

		},
	};

}
