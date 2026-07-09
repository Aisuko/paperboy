import * as THREE from 'three';
import { TOKENS } from '../data/tokens.js';
import { addStandardLighting, createStarfield, createFloor, createOrbNode, createLabel } from '../utils/sceneKit.js';
import { IPCLink } from '../utils/ipcLink.js';

const SPACING = 1.6;
const TOKEN_COLOR = 0x8b7bff;
const EMBED_COLOR = 0x35d0ba;

export function buildTokenizeWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene, 0x8b7bff );
	scene.add( createStarfield() );
	scene.add( createFloor( 7, 0x0e0e18 ) );

	const rig = new THREE.Group();
	scene.add( rig );

	const offset = ( ( TOKENS.length - 1 ) * SPACING ) / 2;
	const chips = [];
	const points = [];
	const links = [];

	TOKENS.forEach( ( token, i ) => {

		const x = i * SPACING - offset;

		const chip = createOrbNode( { color: TOKEN_COLOR, radius: 0.24 } );
		chip.position.set( x, 1.6, 0 );
		chip.userData.detail = {
			category: 'Token',
			name: `"${ token.text }"`,
			blurb: `Token ID ${ token.id }`,
			description: '',
			metric: `[${ token.embedding.join( ', ' ) }]`,
			metricLabel: 'Embedding vector',
		};
		const chipLabel = createLabel( `"${ token.text }" · id ${ token.id }` );
		chipLabel.position.set( 0, 0.42, 0 );
		chip.add( chipLabel );
		rig.add( chip );
		chips.push( chip );

		// Project the 4D mock embedding into a small 3D offset below the chip.
		const [ e0, e1, e2, e3 ] = token.embedding;
		const point = createOrbNode( { color: EMBED_COLOR, radius: 0.13 } );
		point.position.set( x + e0 * 1.4, -0.6 + e1 * 1.2, e2 * 1.4 + e3 * 0.6 );
		rig.add( point );
		points.push( point );

		links.push( new IPCLink( rig, chip.position.clone(), point.position.clone(), EMBED_COLOR, { particleCount: 2, speed: 0.3, radius: 0.014, arc: 0.15 } ) );

	} );

	const embedLabel = createLabel( 'embedding space (768d, projected)', 'label2d label2d-dim' );
	embedLabel.position.set( 0, -1.6, 0 );
	rig.add( embedLabel );

	let stage = 0;

	function showStage( index ) {

		stage = index;
		chips.forEach( ( chip ) => {

			chip.material.emissiveIntensity = stage === 0 ? 1.6 : 0.5;

		} );
		points.forEach( ( point ) => {

			point.material.emissiveIntensity = stage === 1 ? 1.8 : 0.6;
			point.scale.setScalar( stage === 1 ? 1.25 : 1 );

		} );

	}

	showStage( 0 );

	let elapsed = 0;

	return {
		scene,
		interactables: chips,
		defaultView: {
			position: new THREE.Vector3( 0, 1.6, 6.2 ),
			target: new THREE.Vector3( 0, 0.2, 0 ),
		},
		showStage,
		update( dt ) {

			elapsed += dt;
			for ( const link of links ) link.update( dt );
			points.forEach( ( point, i ) => { point.position.y += Math.sin( elapsed * 1.2 + i ) * 0.0004; } );

		},
	};

}
