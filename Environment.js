import { defs, tiny } from './examples/common.js'

const {
  Vector,
  Vector3,
  vec,
  vec3,
  vec4,
  color,
  hex_color,
  Shader,
  Matrix,
  Mat4,
  Light,
  Shape,
  Material,
  Scene,
  Texture,
} = tiny

const { Square, Subdivision_Sphere, Torus, Axis_Arrows, Closed_Cone, Rounded_Capped_Cylinder, Textured_Phong } = defs

const S_SCALE = 100 // sky scale
const G_SCALE = 100 // ground scale
const A_SCALE = 8 // arch scale
const R_SCALE = 6 // road scale
const C_SCALE = 3; // arrow scale
export class Environment extends Scene {
  /**
   *  **Base_scene** is a Scene that can be added to any display canvas.
   *  Setup the shapes, materials, camera, and lighting here.
   */
  constructor() {
    // constructor(): Scenes begin by populating initial values like the Shapes and Materials they'll need.
    super()

    // TODO:  Create two cubes, including one with the default texture coordinates (from 0 to 1), and one with the modified
    //        texture coordinates as required for cube #2.  You can either do this by modifying the cube code or by modifying
    //        a cube instance's texture_coords after it is already created.
    this.shapes = {
      sphere: new Subdivision_Sphere(4),
      square: new Square(),
      torus: new Torus(6, 15),
      axis: new Axis_Arrows(),
      cylinder: new Rounded_Capped_Cylinder(10, 10),
      cone: new Closed_Cone(10, 10),
    }

    this.prev_z = -90;
    // TODO:  Create the materials required to texture both cubes with the correct images and settings.
    //        Make each Material from the correct shader.  Phong_Shader will work initially, but when
    //        you get to requirements 6 and 7 you will need different ones.
    this.materials = {
      phong: new Material(new Textured_Phong(), {
        color: hex_color('#ffffff'),
      }),
      grass: new Material(new Textured_Phong(), {
        color: color(0, 0, 0, 1),
        ambient: 0.5,
        diffusivity: 0.1,
        specularity: 0.1,
        texture: new Texture('assets/grass.png'),
      }),
      stars: new Material(new Textured_Phong(), {
        color: color(0, 0, 0, 1),
        ambient: 0.5,
        diffusivity: 0.1,
        specularity: 0.1,
        texture: new Texture('assets/stars.png'),
      }),
      road: new Material(new Textured_Phong(), {
        color: color(0, 0, 0, 1),
        ambient: 0.5,
        diffusivity: 0.1,
        specularity: 0.1,
        texture: new Texture('assets/road.png'),
      }),
      sky: new Material(new Textured_Phong(), {
        color: hex_color('#87CEEB'),
        ambient: 0.5,
        diffusivity: 0.1,
        specularity: 0.1,
      }),
    }

    this.initial_camera_location = Mat4.look_at(
      vec3(0, 10, 20),
      vec3(0, 0, 0),
      vec3(0, 1, 0)
    )
  }

  make_control_panel() {
    // Add neccesary controls to make the game work
  }

  display(context, program_state) {
    if (!context.scratchpad.controls) {
      this.children.push(
        (context.scratchpad.controls = new defs.Movement_Controls())
      )
      // Define the global camera and projection matrices, which are stored in program_state.
      program_state.set_camera(Mat4.translation(0, -1, -90))
    }

    program_state.projection_transform = Mat4.perspective(
      Math.PI / 4,
      context.width / context.height,
      1,
      100
    )
    

    const light_position = vec4(10, 10, 10, 1);
    program_state.lights = [new Light(light_position, color(1, 1, 1, 1), 1000)];

    let t = program_state.animation_time / 1000,
      dt = program_state.animation_delta_time / 1000
    let sky_transform = Mat4.identity();
    let ground_transform = Mat4.identity();
    let arch_transform = Mat4.identity();
    let road_transform = Mat4.identity();
    let arrow_transform = Mat4.identity();
    
    arrow_transform = arrow_transform.times(Mat4.translation(0, 3, 75));
    arrow_transform = arrow_transform.times(Mat4.scale(1, 1, C_SCALE));
    this.shapes.cylinder.draw(context, program_state, arrow_transform, this.materials.sky);
    arrow_transform = arrow_transform.times(Mat4.scale(3, 1.5, 3/5));
    arrow_transform = arrow_transform.times(Mat4.rotation(Math.PI, 0, 1, 0));
    arrow_transform = arrow_transform.times(Mat4.translation(0, 0, C_SCALE*3/5));
    this.shapes.cone.draw(context, program_state, arrow_transform, this.materials.sky);
    
    // Check which way car is moving (z-axis only for now)
    let dz = this.prev_z - program_state.camera_inverse[2][3];
    this.prev_z = program_state.camera_inverse[2][3];
    
    // Moving "forward" with respect to original camera location and orientation
    if (dz < 0){
        this.positional_offset = Mat4.translation(0, 0, this.prev_z + dz)
        //console.log(this.prev_z + dz);
    }
    // Moving "backward" with respect to original camera location and orientation
    else if (dz > 0){ 
        this.positional_offset = Mat4.translation(0, 0, this.prev_z + dz);
        //console.log(this.prev_z + dz);
    }
    
    // draw the sky
    sky_transform = sky_transform.times(Mat4.scale(S_SCALE, S_SCALE, S_SCALE));
    
    this.shapes.sphere.draw(
      context,
      program_state,
      sky_transform,
      this.materials.sky
    )

    // draw the ground
    ground_transform = ground_transform
      .times(Mat4.rotation(Math.PI / 2, 1, 0, 0))
      .times(Mat4.scale(G_SCALE, G_SCALE, G_SCALE))
    this.shapes.square.draw(
      context,
      program_state,
      ground_transform,
      this.materials.grass
    )

    // draw the road
    road_transform = road_transform
      .times(Mat4.translation(0, 0.1, 90))
      .times(Mat4.rotation(Math.PI / 2, 1, 0, 0))
      .times(Mat4.scale(R_SCALE, R_SCALE, R_SCALE))
    for (let i = 0; i < 15; i++) {
      this.shapes.square.draw(
        context,
        program_state,
        road_transform,
        this.materials.road
      )
      road_transform = road_transform.times(Mat4.translation(0, -2, 0))
    }

    // draw the arches
    arch_transform = arch_transform
      .times(Mat4.translation(0, 0, 100))
      .times(Mat4.scale(A_SCALE, A_SCALE, A_SCALE))
    for (let i = 0; i < 10; i++) {
      arch_transform = arch_transform.times(Mat4.translation(0, 0, -2))
      this.shapes.torus.draw(
        context,
        program_state,
        arch_transform,
        this.materials.stars
      )
    }
    arch_transform = arch_transform.times(Mat4.translation(0, 5, 0));
    this.shapes.cylinder.draw(context, program_state, arch_transform, this.materials.stars);
  }
}
