import * as THREE from 'three/webgpu';
import { pass } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

export function createRenderer() {

	const renderer = new THREE.WebGPURenderer( { antialias: true, powerPreference: 'high-performance' } );
	renderer.setPixelRatio( Math.min( window.devicePixelRatio, 2 ) );
	renderer.setSize( window.innerWidth, window.innerHeight );
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.05;
	return renderer;

}

export function createLabelRenderer() {

	const labelRenderer = new CSS2DRenderer();
	labelRenderer.setSize( window.innerWidth, window.innerHeight );
	labelRenderer.domElement.style.position = 'absolute';
	labelRenderer.domElement.style.top = '0';
	labelRenderer.domElement.style.left = '0';
	labelRenderer.domElement.style.pointerEvents = 'none';
	return labelRenderer;

}

export function createRenderPipeline( renderer ) {

	return new THREE.RenderPipeline( renderer );

}

export function buildSceneOutput( scene, camera, { strength = 0.55, radius = 0.4, threshold = 0.15 } = {} ) {

	const scenePass = pass( scene, camera );
	const scenePassColor = scenePass.getTextureNode( 'output' );
	const bloomPass = bloom( scenePassColor, strength, radius, threshold );
	return scenePassColor.add( bloomPass );

}
