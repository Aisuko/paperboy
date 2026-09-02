import * as THREE from 'three';
import { addStandardLighting, createDeck, createLabel, THEME } from '../utils/sceneKit.js';
import { createWall, paintCell } from '../utils/tensorKit.js';
import { AGENTS, DEFAULTS, label } from '../data/model.js';
import { GUARD_STEPS } from '../data/copy.js';

const COLS = DEFAULTS.budget + 1;
const ROWS = AGENTS.length;
const SIDE_X = 2.1;

const VIEWS = [
	{ position: new THREE.Vector3( 0, 3.4, 12.4 ), target: new THREE.Vector3( 0, 0.4, 0 ) },
	{ position: new THREE.Vector3( 1.1, 3.0, 11.0 ), target: new THREE.Vector3( 0.8, 0.4, 0 ) },
	{ position: new THREE.Vector3( -1.1, 3.0, 11.0 ), target: new THREE.Vector3( -0.8, 0.4, 0 ) },
	{ position: new THREE.Vector3( 0, 6.6, 11.6 ), target: new THREE.Vector3( 0, 0.2, 0 ) },
];

function buildPanel( x, title ) {

	const group = new THREE.Group();
	group.position.x = x;

	const wall = createWall( { rows: ROWS, cols: COLS, cell: 0.25, gap: 0.05, depth: 0.07 } );
	wall.position.y = 0.25;
	group.add( wall );

	const head = createLabel( title, 'label2d label2d-key' );
	head.position.set( 0, 1.0, 0 );
	group.add( head );

	const verdict = createLabel( '', 'label2d' );
	verdict.position.set( 0, -0.575, 0 );
	group.add( verdict );

	const detail = createLabel( '', 'label2d label2d-dim' );
	detail.position.set( 0, -0.81, 0 );
	group.add( detail );

	return { group, wall, head, verdict, detail };

}

export function buildGuardsWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene );
	scene.add( createDeck( 50, { y: -2.6, divisions: 50 } ) );

	const interactables = [];

	const kept = buildPanel( -SIDE_X, 'all guards on' );
	const broken = buildPanel( SIDE_X, 'guard removed' );
	scene.add( kept.group, broken.group );

	[ kept, broken ].forEach( ( panel, side ) => {

		panel.wall.userData.cells.forEach( ( c ) => {

			c.userData.side = side;
			interactables.push( c );

		} );

	} );

	for ( let r = 0; r < ROWS; r ++ ) {

		const step = 0.3;
		const y = 0.25 + ( ( ROWS - 1 ) / 2 - r ) * step;
		[ -SIDE_X, SIDE_X ].forEach( ( x, side ) => {

			const l = createLabel( AGENTS[ r ].name, 'label2d label2d-dim' );
			l.position.set( x + ( side ? 1 : -1 ) * ( COLS * step / 2 + 0.375 ), y, 0 );
			scene.add( l );

		} );

	}

	const colAxis = createLabel( 'rounds left → right   ·   cell brightness = p(" 5")', 'label2d label2d-dim' );
	colAxis.position.set( 0, 1.31, 0 );
	scene.add( colAxis );

	const stressLabel = createLabel( '', 'label2d label2d-dim' );
	stressLabel.position.set( 0, 1.525, 0 );
	scene.add( stressLabel );

	const switches = GUARD_STEPS.map( ( g, i ) => {

		const key = Object.keys( g.kill )[ 0 ];
		const group = new THREE.Group();
		group.position.set( ( i - ( GUARD_STEPS.length - 1 ) / 2 ) * 1.3, -1.1, 2.3 );

		const base = new THREE.Mesh(
			new THREE.BoxGeometry( 0.75, 0.1, 0.45 ),
			new THREE.MeshStandardMaterial( { color: 0x131c20, roughness: 0.6, metalness: 0.3 } ),
		);
		group.add( base );

		const lever = new THREE.Mesh(
			new THREE.BoxGeometry( 0.55, 0.12, 0.25 ),
			new THREE.MeshStandardMaterial( { color: 0x1a262c, emissive: THEME.accent, emissiveIntensity: 0.5, roughness: 0.4 } ),
		);
		lever.position.y = 0.11;
		lever.userData.guard = key;
		lever.userData.index = i;
		group.add( lever );
		interactables.push( lever );

		const name = createLabel( key, 'label2d label2d-dim' );
		name.position.set( 0, 0.31, 0 );
		group.add( name );

		scene.add( group );
		return { group, lever, name, key };

	} );

	let step = 0;
	let runs = null;

	function fill( panel, run ) {

		panel.wall.userData.cells.forEach( ( c ) => {

			const rd = run.rounds[ c.userData.col ];
			const p = rd ? rd.per[ c.userData.row ].p[ 0 ] : 0;
			paintCell( c, p, { gain: 1.15, dim: ! rd } );
			c.userData.p = p;
			c.userData.dead = ! rd;

		} );

		panel.verdict.element.textContent = run.published
			? `published "${ label( run.final.top ) }"${ run.correct ? '' : '  ✗ wrong' }`
			: 'withheld — council still split';
		panel.verdict.element.className = run.published && run.correct ? 'label2d label2d-key' : 'label2d';
		panel.detail.element.textContent = `stopped r${ run.stoppedAt } · JSD ${ run.final.jsd.toFixed( 3 ) } · ε ${ run.params.eps.toFixed( 2 ) }`;

	}

	function render() {

		fill( kept, runs.kept );
		fill( broken, runs.broken );
		broken.head.element.textContent = `${ Object.keys( GUARD_STEPS[ step ].kill )[ 0 ] } removed`;
		stressLabel.element.textContent = GUARD_STEPS[ step ].stressLabel;

		switches.forEach( ( sw, i ) => {

			const off = i === step;
			sw.lever.rotation.z = off ? 0.34 : 0;
			sw.lever.material.emissive.set( off ? THEME.rose : THEME.accent );
			sw.lever.material.emissiveIntensity = off ? 0.85 : 0.3;
			sw.name.element.className = off ? 'label2d label2d-key' : 'label2d label2d-dim';

		} );

	}

	return {
		scene,
		interactables,
		getStepView( i ) { return VIEWS[ Math.max( 0, Math.min( VIEWS.length - 1, i ) ) ]; },
		setRuns( next ) { runs = next; render(); },
		setStep( i ) { step = i; if ( runs ) render(); },
		getStep() { return step; },
		describe( object ) {

			const u = object.userData;

			if ( u.guard ) return {
				category: `guard ${ u.index + 1 } of ${ switches.length }`,
				name: GUARD_STEPS[ u.index ].title,
				blurb: GUARD_STEPS[ u.index ].formula,
				description: GUARD_STEPS[ u.index ].desc,
				metricLabel: 'state on the right-hand run',
				metric: u.index === step ? 'removed' : 'on',
			};

			const run = u.side ? runs.broken : runs.kept;
			const rd = run.rounds[ u.col ];

			if ( ! rd ) return {
				category: u.side ? 'guard removed' : 'all guards on',
				name: `round ${ u.col } never ran`,
				blurb: `the run stopped at round ${ run.stoppedAt }`,
				description: run.published ? 'JSD fell under ε first, so the remaining budget went unspent.' : 'The budget ran out earlier than this column.',
				metricLabel: '',
				metric: '',
			};

			const s = rd.per[ u.row ];

			return {
				category: `${ u.side ? 'guard removed' : 'all guards on' } · round ${ rd.r }`,
				name: `${ AGENTS[ u.row ].name } on " 5"`,
				blurb: `top "${ label( s.top ) }" · H ${ s.H.toFixed( 3 ) } nats`,
				description: `Pooling weight ${ s.conf.toFixed( 3 ) }, packet of ${ s.msg.length } ${ s.msg.length === 1 ? 'pair' : 'pairs' }. Council JSD at this round is ${ rd.jsd.toFixed( 3 ) } against ε ${ run.params.eps.toFixed( 2 ) }.`,
				metricLabel: 'p(" 5")',
				metric: u.p.toFixed( 4 ),
			};

		},
		update() {},
	};

}
