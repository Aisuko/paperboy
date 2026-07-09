import * as THREE from 'three/webgpu';
import { pass } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

// Thin wrapper around THREE.WebGPURenderer + the node-based RenderPipeline.
// WebGPURenderer targets WebGPU where available and silently falls back to
// a WebGL2 backend otherwise, so a single code path covers both.

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

// Builds a scene-pass + bloom output node for one world's scene. Built once
// per world at startup and swapped onto `renderPipeline.outputNode` on
// switchWorld — the shared `camera` object is mutated in place (tweened) so
// every pre-built pass still tracks the live camera. NOTE: reassigning
// `renderPipeline.outputNode` alone does nothing after the first render —
// RenderPipeline caches its compiled quad material and only rebuilds it when
// `renderPipeline.needsUpdate` is set back to `true` (see its `render()`).
export function buildSceneOutput( scene, camera, { strength = 0.55, radius = 0.4, threshold = 0.15 } = {} ) {

	const scenePass = pass( scene, camera );
	const scenePassColor = scenePass.getTextureNode( 'output' );
	const bloomPass = bloom( scenePassColor, strength, radius, threshold );
	return scenePassColor.add( bloomPass );

}
