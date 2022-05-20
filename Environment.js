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

const { Square, Subdivision_Sphere, Torus, Axis_Arrows, Textured_Phong, Cube, Phong_Shader } = defs

const S_SCALE = 100 // sky scale
const G_SCALE = 100 // ground scale
const A_SCALE = 8 // arch scale
const R_SCALE = 6 // road scale
const C_SCALE = 2 // car scale
const FORWARD_MOVE = 0.1
const BACKWARD_MOVE = 0.1
const RIGHT_MOVE = 0.1
const LEFT_MOVE = 0.1
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
      car: new Cube(),
    }

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
      car: new Material(new Phong_Shader(), {
        color: hex_color('#FFFFFF'),
        ambient: 1,
        diffusivity: 0.1,
        specularity: 0.1,
      }),
    }

    this.initial_camera_location = Mat4.look_at(
      vec3(0, 10, 20),
      vec3(0, 0, 0),
      vec3(0, 1, 0)
    )
    this.X_POS = 0;
    this.prev_X_POS = 0;
    this.Y_POS = 0;
    this.prev_Y_POS = 0;
    this.Z_POS = 0;
    this.prev_Z_POS = 0;
    this.car_speed = 0;
    this.prev_car_speed = 0;
    this.car_acc = 0;
    this.t = 0;
    this.prev_t = 0;
    this.rev = false;
  }

  move_forward() {
    //this.X_POS += 1;
    //this.Z_POS -= FORWARD_MOVE;
    this.car_acc = 1;
  }
  move_backward() {
    //this.X_POS -= 1;
    //this.Z_POS += BACKWARD_MOVE;
    this.car_acc = -0.1;
    this.rev = true;
  }
  default_acc(){
    //this.t = 0;
    this.car_acc = 0;
    this.rev = false;
  }
  move_right() {
    //this.Y_POS += 1;
    this.X_POS += RIGHT_MOVE;
  }
  move_left() {
    //this.Y_POS -= 1;
    this.X_POS -= LEFT_MOVE;
  }

  movement(t){
    // if (this.t === 0 && this.car_acc !== 0){
    //   this.prev_t = t;
    //   //this.t = t;
    // }
    // this.t = t - this.prev_t;
    // if(this.car_acc===0 ) {
    //   this.prev_car_speed = this.car_speed;
    // }
    // if(this.car_speed===0){
    //   this.prev_Z_POS = this.Z_POS;
    //   this.prev_X_POS = this.X_POS;
    //   this.prev_Y_POS = this.Y_POS;
    // }
    //this.car_speed = this.prev_car_speed + this.car_acc * this.t;
    //let dist = 0.5*(this.car_speed + this.prev_car_speed);
    //this.Z_POS = this.prev_Z_POS - dist;
    if (this.car_acc>0){
      this.car_speed+=0.01;
    }
    else if(this.car_acc<0){
      this.car_speed-=0.01;
    }
    else{
      if(this.rev===false) {
        if(this.car_speed>0)
          this.car_speed -= 0.1;
        else
          this.car_speed = 0;
      }
      else {
        if(this.car_speed>0)
          this.car_speed += 0.1;
        else
          this.car_speed = 0;
      }
    }
    if(this.car_speed<-0.5)
      this.car_speed = -0.5;
    if(this.car_speed>0.5)
      this.car_speed = 0.5;
    this.Z_POS -= 0.5*this.car_speed;


  }

  make_control_panel() {
    // Add neccesary controls to make the game work
    this.key_triggered_button("World view", ["Control", "0"], () => this.attached = () => null);
    this.new_line();
    this.key_triggered_button("Car view", ["Control", "1"], () => this.attached = () => this.car);
    this.new_line();
    this.key_triggered_button("Move Forward", ["u"], this.move_forward,'#6E6460', this.default_acc);
    this.key_triggered_button("Move Backward", ["j"], this.move_backward,'#6E6460', this.default_acc);
    this.key_triggered_button("Move Right", ["k"], this.move_right);
    this.key_triggered_button("Move Left", ["h"], this.move_left);
  }

  display(context, program_state) {
    if (!context.scratchpad.controls) {
      this.children.push(
        (context.scratchpad.controls = new defs.Movement_Controls())
      )
      // Define the global camera and projection matrices, which are stored in program_state.
      program_state.set_camera(Mat4.translation(0, -1, -90))
    }

    if (this.attached !== undefined) {
      let desired = this.initial_camera_location;
      if (this.attached() !== null)
        desired = Mat4.inverse(this.attached().times(Mat4.translation(0, 0, 5)));
      desired = desired.map((x,i) => Vector.from(program_state.camera_inverse[i]).mix(x, 0.1));
      program_state.set_camera(desired);
    }

    program_state.projection_transform = Mat4.perspective(
      Math.PI / 4,
      context.width / context.height,
      1,
      100
    )

    const light_position = vec4(10, 10, 10, 1)
    program_state.lights = [new Light(light_position, color(1, 1, 1, 1), 1000)]

    let t = program_state.animation_time / 1000,
      dt = program_state.animation_delta_time / 1000
    let sky_transform = Mat4.identity()
    let ground_transform = Mat4.identity()
    let arch_transform = Mat4.identity()
    let road_transform = Mat4.identity()
    let car_transform = Mat4.identity()

    // draw the sky
    sky_transform = sky_transform.times(Mat4.scale(S_SCALE, S_SCALE, S_SCALE))
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

    // draw the car
    this.movement(program_state.animation_time / 1000);
    car_transform = car_transform.times(Mat4.scale(C_SCALE, C_SCALE, C_SCALE))
                    .times(Mat4.translation(this.X_POS, this.Y_POS, this.Z_POS))

    //for (let i = 0; i < 10; i++) {
      //car_transform = car_transform.times(Mat4.translation(0, 0, -2))
    this.shapes.car.draw(
        context,
        program_state,
        car_transform,
        this.materials.car
    )
    this.car = car_transform.times(Mat4.translation(0, 0.4, 0));
   // }

  }
}
