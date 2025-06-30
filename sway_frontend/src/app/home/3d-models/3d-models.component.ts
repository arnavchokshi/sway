import { Component, ElementRef, OnInit, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

@Component({
  selector: 'app-3d-models',
  templateUrl: './3d-models.component.html',
  styleUrls: ['./3d-models.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class ThreeDModelsComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('rendererContainer') rendererContainer!: ElementRef;

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private laptopModel!: THREE.Group;
  private iphoneModel!: THREE.Group;
  private animationId!: number;

  // Custom screen content
  laptopScreenContent = 'Sway Dashboard';
  iphoneScreenContent = 'Formation View';

  ngOnInit() {}

  ngAfterViewInit() {
    this.initThreeJS();
    this.loadModels();
    this.animate();
  }

  ngOnDestroy() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    if (this.renderer) {
      this.renderer.dispose();
    }
  }

  private initThreeJS() {
    const container = this.rendererContainer.nativeElement;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = null; // Transparent background

    // Camera
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    this.camera.position.set(0, 1, 6);
    this.camera.lookAt(0, -1, 0); // Look higher

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0); // Fully transparent
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    container.appendChild(this.renderer.domElement);

    // Lighting (unchanged)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(5, 5, 5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    this.scene.add(directionalLight);
    const pointLight1 = new THREE.PointLight(0x4a90e2, 0.8, 10);
    pointLight1.position.set(-3, 2, 3);
    this.scene.add(pointLight1);
    const pointLight2 = new THREE.PointLight(0x50c878, 0.8, 10);
    pointLight2.position.set(3, 2, 3);
    this.scene.add(pointLight2);
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.3);
    rimLight.position.set(-5, 0, -5);
    this.scene.add(rimLight);
    window.addEventListener('resize', this.onWindowResize.bind(this));
  }

  private loadModels() {
    const loader = new GLTFLoader();
    const textureLoader = new THREE.TextureLoader();

    // Load laptop model
    loader.load('/assets/models/laptop/scene.gltf', (gltf) => {
      this.laptopModel = gltf.scene;
      this.laptopModel.scale.set(1.5, 1.5, 1.5);
      this.laptopModel.position.set(-10.7, 0, 5);
      this.laptopModel.rotation.y = THREE.MathUtils.degToRad(16); // 15 degrees to the right
      
      // Find and customize the laptop screen
      this.laptopModel.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          
          // Only replace the screen mesh's map (try Cube_Material003_0)
          if (child.name === 'Cube_Material003_0') {
            const laptopTexture = textureLoader.load('assets/laptop.png', (texture) => {
              texture.wrapS = THREE.ClampToEdgeWrapping;
              texture.wrapT = THREE.ClampToEdgeWrapping;
              texture.repeat.set(2.3, 1.8); // Balanced zoom
              texture.offset.set(0, 0);
              texture.center.set(0.5, 0.5);
              texture.rotation = 0;
              texture.needsUpdate = true;
            });
            if (Array.isArray(child.material)) {
              child.material.forEach(mat => {
                if ('map' in mat) mat.map = laptopTexture;
                if ('color' in mat) mat.color.set(0xffffff); // Set color to white
                if ('emissive' in mat) mat.emissive.set(0x000000); // Set emissive to black
                if ('needsUpdate' in mat) mat.needsUpdate = true;
              });
            } else {
              if ('map' in child.material) child.material.map = laptopTexture;
              if ('color' in child.material) child.material.color.set(0xffffff);
              if ('emissive' in child.material) child.material.emissive.set(0x000000);
              if ('needsUpdate' in child.material) child.material.needsUpdate = true;
            }
          }
        }
      });

      this.scene.add(this.laptopModel);
    });

    // Load iPhone model
    loader.load('/assets/models/iphone/scene.gltf', (gltf) => {
      this.iphoneModel = gltf.scene;
      this.iphoneModel.scale.set(0.6, 0.6, 0.6);
      this.iphoneModel.position.set(1.2, 0, 0.5); // Move slightly left for symmetry
      this.iphoneModel.rotation.y = THREE.MathUtils.degToRad(-15); // 15 degrees to the left
      
      // Find and customize the iPhone screen
      this.iphoneModel.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          
          // Look for screen material
          if (child.material && (
            (child.material as any).emissive || 
            child.name.toLowerCase().includes('screen') ||
            child.name.toLowerCase().includes('display')
          )) {
            this.createCustomScreen(child, this.iphoneScreenContent, 0x50c878);
          }
        }
      });
      
      this.scene.add(this.iphoneModel);
    });
  }

  private createCustomScreen(mesh: THREE.Mesh, text: string, color: number) {
    // Create a canvas for the screen content
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    canvas.width = 512;
    canvas.height = 512;

    // Set background with gradient
    const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, `#${color.toString(16)}`);
    gradient.addColorStop(1, `#${(color + 0x222222).toString(16)}`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    // Add some UI elements to make it look more realistic
    context.fillStyle = 'rgba(255, 255, 255, 0.1)';
    context.fillRect(20, 20, canvas.width - 40, 60);
    
    // Add text
    context.fillStyle = '#ffffff';
    context.font = 'bold 48px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, canvas.width / 2, canvas.height / 2);
    
    // Add some icons or additional text
    context.font = '24px Arial';
    context.fillStyle = 'rgba(255, 255, 255, 0.7)';
    context.fillText('Sway App', canvas.width / 2, canvas.height / 2 + 60);

    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    // Apply texture to mesh with emissive material for better visibility
    const material = new THREE.MeshBasicMaterial({ 
      map: texture,
      transparent: true,
      opacity: 0.95
    });
    
    // Also create an emissive material for the screen glow
    const emissiveMaterial = new THREE.MeshStandardMaterial({
      map: texture,
      emissive: new THREE.Color(color),
      emissiveIntensity: 0.3,
      transparent: true,
      opacity: 0.9
    });
    
    mesh.material = emissiveMaterial;
  }

  private animate() {
    this.animationId = requestAnimationFrame(this.animate.bind(this));
    const time = Date.now() * 0.001;
    if (this.laptopModel) {
      this.laptopModel.position.y = 0;
    }
    if (this.iphoneModel) {
      this.iphoneModel.position.y = 0;
    }
    this.renderer.render(this.scene, this.camera);
  }

  private onWindowResize() {
    const container = this.rendererContainer.nativeElement;
    const width = container.clientWidth;
    const height = container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  // Method to update screen content
  updateLaptopScreen(content: string) {
    this.laptopScreenContent = content;
  }

  updateIphoneScreen(content: string) {
    this.iphoneScreenContent = content;
  }
} 