import * as THREE from 'three';
import { TOKENS } from '../data/tokens.js';
import { addStandardLighting, createDeck, createOrbNode, createLabel, createAxisFrame, THEME } from '../utils/sceneKit.js';
import { IPCLink } from '../utils/ipcLink.js';
import { tween } from '../utils/tween.js';

const SPACING = 1.35;
const TOKEN_COLOR = THEME.info;
const EMBED_COLOR = THEME.accent;
const NEIGHBOUR_COLOR = THEME.signal;

// Cosine similarity between two equal-length mock embedding vectors —
// illustrative only (real GPT-2 embeddings are 768d; these are 4d stand-ins).
function cosineSimilarity( a, b ) {

	let dot = 0, na = 0, nb = 0;
	for ( let i = 0; i < a.length; i ++ ) {

		dot += a[ i ] * b[ i ];
		na += a[ i ] * a[ i ];
		nb += b[ i ] * b[ i ];

	}
	return na && nb ? dot / ( Math.sqrt( na ) * Math.sqrt( nb ) ) : 0;

}

export function buildTokenizeWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene );
	scene.add( createDeck( 22, { y: -2.4, divisions: 44 } ) );

	const rig = new THREE.Group();
	scene.add( rig );

	const offset = ( ( TOKENS.length - 1 ) * SPACING ) / 2;
	const chips = [];
	const points = [];
	const links = [];

	TOKENS.forEach( ( token, i ) => {

		const x = i * SPACING - offset;

		const chip = createOrbNode( { color: TOKEN_COLOR, radius: 0.16 } );
		chip.position.set( x, 1.6, 0 );
		chip.userData.detail = {
			category: 'Token',
			name: `"${ token.text }"  (id ${ token.id })`,
			blurb: `Position ${ token.position } in the sequence.`,
			description: 'GPT-2 byte-pair encoding treats the leading space as part of the token, so " weather" and "weather" are two different IDs. The ID is not a number the model does arithmetic on — it indexes a row of the embedding matrix.',
			metric: `wte[${ token.id }] + wpe[${ token.position }]`,
			metricLabel: 'Embedding lookup',
		};
		const chipLabel = createLabel( `${ token.display } · ${ token.id }`, 'label2d label2d-key' );
		chipLabel.position.set( 0, 0.42, 0 );
		chip.add( chipLabel );
		rig.add( chip );
		chips.push( chip );

		// Project the 4D mock embedding into a small 3D offset below the chip.
		const [ e0, e1, e2, e3 ] = token.embedding;
		const point = createOrbNode( { color: EMBED_COLOR, radius: 0.1 } );
		point.position.set( x + e0 * 1.4, -0.6 + e1 * 1.2, e2 * 1.4 + e3 * 0.6 );
		rig.add( point );
		points.push( point );

		links.push( new IPCLink( rig, chip.position.clone(), point.position.clone(), EMBED_COLOR, { particleCount: 2, speed: 0.3, radius: 0.014, arc: 0.15 } ) );

	} );

	const embedLabel = createLabel( 'embedding space · 768d, projected to 3d', 'label2d label2d-dim' );
	embedLabel.position.set( 0, -1.6, 0 );
	rig.add( embedLabel );

	// Nearest-neighbour lines: for each token, connect it to whichever other
	// token its mock embedding is most cosine-similar to — a cheap stand-in
	// for the semantic clustering that shows up in a real 768d embedding
	// space once projected down to 3 dimensions.
	const simLines = [];
	TOKENS.forEach( ( token, i ) => {

		let bestJ = -1, bestSim = -Infinity;
		TOKENS.forEach( ( other, j ) => {

			if ( i === j ) return;
			const sim = cosineSimilarity( token.embedding, other.embedding );
			if ( sim > bestSim ) { bestSim = sim; bestJ = j; }

		} );
		if ( bestJ === -1 ) return;

		const geo = new THREE.BufferGeometry().setFromPoints( [ points[ i ].position.clone(), points[ bestJ ].position.clone() ] );
		const mat = new THREE.LineBasicMaterial( { color: NEIGHBOUR_COLOR, transparent: true, opacity: 0 } );
		const line = new THREE.Line( geo, mat );
		line.userData.targetOpacity = 0.2 + Math.max( 0, bestSim ) * 0.5;
		rig.add( line );
		simLines.push( line );

	} );

	// Small axes legend near the cluster, reminding viewers this 3D scatter
	// is a projection of a much higher-dimensional (768d) space.
	const axisFrame = createAxisFrame( { size: 1.5, labels: [ 'dim 1 (projected)', 'dim 2 (projected)', 'dim 3 (projected)' ] } );
	axisFrame.position.set( 0, -1.85, 1.3 );
	axisFrame.traverse( ( obj ) => {

		if ( ! obj.material ) return;
		obj.material.userData.baseOpacity = obj.material.opacity;
		obj.material.opacity = 0;

	} );
	rig.add( axisFrame );

	let stage = 0;

	function showStage( index ) {

		stage = index;
		const showNeighbours = stage === 2;

		chips.forEach( ( chip ) => {

			chip.material.emissiveIntensity = stage === 0 ? 1.0 : 0.35;

		} );
		points.forEach( ( point ) => {

			point.material.emissiveIntensity = stage === 1 ? 1.1 : ( showNeighbours ? 0.7 : 0.4 );
			point.scale.setScalar( stage === 1 ? 1.25 : 1 );

		} );

		simLines.forEach( ( line ) => {

			const from = line.material.opacity;
			const to = showNeighbours ? line.userData.targetOpacity : 0;
			tween( 0.5, ( t ) => { line.material.opacity = THREE.MathUtils.lerp( from, to, t ); } );

		} );

		axisFrame.traverse( ( obj ) => {

			if ( ! obj.material ) return;
			const from = obj.material.opacity;
			const to = showNeighbours ? obj.material.userData.baseOpacity : 0;
			tween( 0.5, ( t ) => { obj.material.opacity = THREE.MathUtils.lerp( from, to, t ); } );

		} );

	}

	showStage( 0 );

	let elapsed = 0;

	return {
		scene,
		interactables: chips,
		defaultView: {
			position: new THREE.Vector3( 0.8, 1.8, 14.4 ),
			target: new THREE.Vector3( 0.8, 0.0, 0 ),
		},
		showStage,
		update( dt ) {

			elapsed += dt;
			for ( const link of links ) link.update( dt );
			points.forEach( ( point, i ) => { point.position.y += Math.sin( elapsed * 1.2 + i ) * 0.0004; } );

		},
	};

}
