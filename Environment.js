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

const {
  Square,
  Subdivision_Sphere,
  Torus,
  Axis_Arrows,
  Closed_Cone,
  Rounded_Capped_Cylinder,
  Textured_Phong,
  Cube,
  Phong_Shader,
} = defs

const S_SCALE = 100 // sky scale
const G_SCALE = 100 // ground scale
const A_SCALE = 8 // arch scale
const R_SCALE = 6 // road scale
const RB_SCALE = 3 // roadblock scale
const C_SCALE = 2 // car scale
const FORWARD_MOVE = 0.1
const BACKWARD_MOVE = 0.1
const RIGHT_MOVE = 0.1
const LEFT_MOVE = 0.1


export class Shape_From_File extends Shape {
  // **Shape_From_File** is a versatile standalone Shape that imports
  // all its arrays' data from an .obj 3D model file.
  constructor(filename) {
    super('position', 'normal', 'texture_coord')
    // Begin downloading the mesh. Once that completes, return
    // control to our parse_into_mesh function.
    this.load_file(filename)
  }

  load_file(filename) {
    // Request the external file and wait for it to load.
    // Failure mode:  Loads an empty shape.
    return fetch(filename)
      .then((response) => {
        if (response.ok) return Promise.resolve(response.text())
        else return Promise.reject(response.status)
      })
      .then((obj_file_contents) => this.parse_into_mesh(obj_file_contents))
      .catch((error) => {
        this.copy_onto_graphics_card(this.gl)
      })
  }

  parse_into_mesh(data) {
    // Adapted from the "webgl-obj-loader.js" library found online:
    var verts = [],
      vertNormals = [],
      textures = [],
      unpacked = {}

    unpacked.verts = []
    unpacked.norms = []
    unpacked.textures = []
    unpacked.hashindices = {}
    unpacked.indices = []
    unpacked.index = 0

    var lines = data.split('\n')

    var VERTEX_RE = /^v\s/
    var NORMAL_RE = /^vn\s/
    var TEXTURE_RE = /^vt\s/
    var FACE_RE = /^f\s/
    var WHITESPACE_RE = /\s+/

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim()
      var elements = line.split(WHITESPACE_RE)
      elements.shift()

      if (VERTEX_RE.test(line)) verts.push.apply(verts, elements)
      else if (NORMAL_RE.test(line))
        vertNormals.push.apply(vertNormals, elements)
      else if (TEXTURE_RE.test(line)) textures.push.apply(textures, elements)
      else if (FACE_RE.test(line)) {
        var quad = false
        for (var j = 0, eleLen = elements.length; j < eleLen; j++) {
          if (j === 3 && !quad) {
            j = 2
            quad = true
          }
          if (elements[j] in unpacked.hashindices)
            unpacked.indices.push(unpacked.hashindices[elements[j]])
          else {
            var vertex = elements[j].split('/')

            unpacked.verts.push(+verts[(vertex[0] - 1) * 3 + 0])
            unpacked.verts.push(+verts[(vertex[0] - 1) * 3 + 1])
            unpacked.verts.push(+verts[(vertex[0] - 1) * 3 + 2])

            if (textures.length) {
              unpacked.textures.push(
                +textures[(vertex[1] - 1 || vertex[0]) * 2 + 0]
              )
              unpacked.textures.push(
                +textures[(vertex[1] - 1 || vertex[0]) * 2 + 1]
              )
            }

            unpacked.norms.push(
              +vertNormals[(vertex[2] - 1 || vertex[0]) * 3 + 0]
            )
            unpacked.norms.push(
              +vertNormals[(vertex[2] - 1 || vertex[0]) * 3 + 1]
            )
            unpacked.norms.push(
              +vertNormals[(vertex[2] - 1 || vertex[0]) * 3 + 2]
            )

            unpacked.hashindices[elements[j]] = unpacked.index
            unpacked.indices.push(unpacked.index)
            unpacked.index += 1
          }
          if (j === 3 && quad)
            unpacked.indices.push(unpacked.hashindices[elements[0]])
        }
      }
    }
    {
      const { verts, norms, textures } = unpacked
      for (var j = 0; j < verts.length / 3; j++) {
        this.arrays.position.push(
          vec3(verts[3 * j], verts[3 * j + 1], verts[3 * j + 2])
        )
        this.arrays.normal.push(
          vec3(norms[3 * j], norms[3 * j + 1], norms[3 * j + 2])
        )
        this.arrays.texture_coord.push(
          vec(textures[2 * j], textures[2 * j + 1])
        )
      }
      this.indices = unpacked.indices
    }
    this.normalize_positions(false)
    this.ready = true
  }

  draw(context, program_state, model_transform, material) {
    // draw(): Same as always for shapes, but cancel all
    // attempts to draw the shape before it loads:
    if (this.ready)
      super.draw(context, program_state, model_transform, material)
  }
}

// COLLISION DETECTION CLASS
export class Body {
  // **Body** can store and update the properties of a 3D body that incrementally
  // moves from its previous place due to velocities.  It conforms to the
  // approach outlined in the "Fix Your Timestep!" blog post by Glenn Fiedler.
  constructor(shape, material, size) {
    Object.assign(this, { shape, material, size })
  }

  // (within some margin of distance).
  static intersect_cube(p, margin = 0) {
    return p.every((value) => value >= -1 - margin && value <= 1 + margin)
  }

  static intersect_sphere(p, margin = 0) {
    return p.dot(p) < 1 + margin
  }

  emplace(
    location_matrix,
    linear_velocity,
    angular_velocity,
    spin_axis = vec3(0, 0, 0).randomized(1).normalized()
  ) {
    // emplace(): assign the body's initial values, or overwrite them.
    this.center = location_matrix.times(vec4(0, 0, 0, 1)).to3()
    this.rotation = Mat4.translation(...this.center.times(-1)).times(
      location_matrix
    )
    this.previous = {
      center: this.center.copy(),
      rotation: this.rotation.copy(),
    }
    // drawn_location gets replaced with an interpolated quantity:
    this.drawn_location = location_matrix
    this.temp_matrix = Mat4.identity()
    return Object.assign(this, { linear_velocity, angular_velocity, spin_axis })
  }

  check_if_colliding(b, collider) {
    // check_if_colliding(): Collision detection function.
    // DISCLAIMER:  The collision method shown below is not used by anyone; it's just very quick
    // to code.  Making every collision body an ellipsoid is kind of a hack, and looping
    // through a list of discrete sphere points to see if the ellipsoids intersect is *really* a
    // hack (there are perfectly good analytic expressions that can test if two ellipsoids
    // intersect without discretizing them into points).
    if (this == b) return false
    // Nothing collides with itself.
    // Convert sphere b to the frame where a is a unit sphere:
    const T = this.inverse.times(b.drawn_location, this.temp_matrix)

    const { intersect_test, points, leeway } = collider
    // For each vertex in that b, shift to the coordinate frame of
    // a_inv*b.  Check if in that coordinate frame it penetrates
    // the unit sphere at the origin.  Leave some leeway.
    return points.arrays.position.some((p) =>
      intersect_test(T.times(p.to4(1)).to3(), leeway)
    )
  }
}

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

      body: new Shape_From_File('assets/body.obj'),
      fenders: new Shape_From_File('assets/fenders.obj'),
      carlights: new Shape_From_File('assets/lights.obj'),
      rear_front: new Shape_From_File('assets/rear_front.obj'),
      wheels: new Shape_From_File('assets/wheels.obj'),

      roadblock: new Shape_From_File('assets/roadblock.obj'),
    }

    this.prev_z = -90
    // TODO:  Create the materials required to texture both cubes with the correct images and settings.
    //        Make each Material from the correct shader.  Phong_Shader will work initially, but when
    //        you get to requirements 6 and 7 you will need different ones.
    this.materials = {
      phong: new Material(new Textured_Phong(), {
        color: hex_color('#ffffff'),
      }),
      body_color: new Material(new Phong_Shader(), {
        color: hex_color('#f50a0a'),
        ambient: 0.2,
        diffusivity: 0.8,
        specularity: 0.8,
      }),
      carlight_color: new Material(new Phong_Shader(), {
        color: hex_color('#ffffff'),
        ambient: 1,
        diffusivity: 0.8,
        specularity: 0.8,
      }),
      tyre_color: new Material(new Textured_Phong(), {
        color: hex_color('#606363'),
      }),
      fender_color: new Material(new Phong_Shader(), {
        color: hex_color('#000000'),
        ambient: 1,
        diffusivity: 0.8,
        specularity: 0.8,
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
      rear_front_color: new Material(new Textured_Phong(), {
        color: hex_color('#0080ff'),
      }),
      roadblock_color: new Material(new Textured_Phong(), {
        color: hex_color('#2F4F4F'),
      }),
    }

    this.initial_camera_location = Mat4.look_at(
      vec3(0, 10, 20),
      vec3(0, 0, 0),
      vec3(0, 1, 0)
    );

    
    this.X_POS = 0;
    this.prev_X_POS = 0;
    this.Y_POS = 0;
    this.prev_Y_POS = 0;
    this.Z_POS = 0;
    this.prev_Z_POS = 0;
    this.car_speed = 0;
    this.prev_car_speed = 0;
    this.car_acc = 0.01;
    this.car_acc_dir = 0;
    this.t = 0;
    this.prev_t = 0;
    this.car_yaw = 0;
    this.angle_inc = 3*(Math.PI/180);
    this.car_turn = 0; // 1 for right and -1 for left and 0 for straight or reverse
    this.car_pitch = 0;
    this.car_roll = 0;
    this.car_speed_limit = 0.8;
    this.car_transform = Mat4.identity();
    this.car_transform = this.car_transform.times(Mat4.scale(C_SCALE, C_SCALE, C_SCALE));
    this.car_transform = this.car_transform.times(Mat4.translation(0, 0, 30));
    this.audio = new Audio('assets/car-ignition-1.mp3');
    this.audio.volume = 0.2;
    this.car_acc_audio = new Audio('assets/Car (M3 Acceleration).mp3');
    this.car_acc_audio.volume = 0.2;
    this.car_rev_audio = new Audio('assets/car reverse.mp3');
    this.car_rev_audio.volume = 0.2;
    this.audio.play();
    this.car_Z_POS = 60;
    this.car_prev_Z_POS = 60;

    this.obstacles = [
      Mat4.identity()
        .times(Mat4.scale(RB_SCALE, RB_SCALE, RB_SCALE))
        .times(Mat4.translation(-0.45 * RB_SCALE, 1 / RB_SCALE, -23)),
    ]
    this.bodies = [
      new Body(this.shapes.roadblock, undefined, vec3(1, 1, 1)).emplace(
        this.obstacles[0].times(Mat4.scale(1, 0.3, 0.15)),
        vec3(0, 0, 0),
        0
      ),
    ]

    // colliders specifies how to detect collisions between bodies
    this.colliders = [
      {
        intersect_test: Body.intersect_sphere,
        points: new defs.Subdivision_Sphere(1),
        leeway: 0.5,
      },
      {
        intersect_test: Body.intersect_sphere,
        points: new defs.Subdivision_Sphere(2),
        leeway: 0.3,
      },
      {
        intersect_test: Body.intersect_cube,
        points: new defs.Cube(),
        leeway: 0.1,
      },
    ]
    this.collider_selection = 2
  }

  move_forward() {
    this.car_acc_dir = 1;
    this.audio.pause();
    this.audio.currentTime=0;
    // if(this.car_acc_audio.currentTime===0)
    this.car_acc_audio.play();
    // if(this.car_acc_audio.currentTime===16)
    //   this.car_acc_audio.currentTime=12;
    this.car_rev_audio.pause();
    this.car_rev_audio.currentTime=0;
  }
  move_backward() {
    this.car_acc_dir = -1;
    this.car_acc_audio.pause();
    this.audio.currentTime=0;
    this.audio.pause();
    this.car_acc_audio.currentTime=0;
    //this.audio.play();
    this.car_rev_audio.play();
  }
  default_acc(){
    this.car_acc_dir = 0;
    this.car_acc_audio.pause();
    this.car_acc_audio.currentTime=0;
    this.car_rev_audio.pause();
    this.car_rev_audio.currentTime=0;
    this.audio.currentTime=4;
    this.audio.play();
    this.car_transform = this.car_transform.times(Mat4.translation(this.X_POS, this.Y_POS, this.Z_POS))
        .times(Mat4.rotation(this.car_yaw, 0, 1, 0));
    this.Z_POS = 0;
    this.X_POS = 0;
    this.Y_POS = 0;
    this.car_yaw = 0;
  }
  default_turn(){
    this.car_turn = 0;
    this.car_transform = this.car_transform.times(Mat4.translation(this.X_POS, this.Y_POS, this.Z_POS))
        .times(Mat4.rotation(this.car_yaw, 0, 1, 0));
    this.Z_POS = 0;
    this.X_POS = 0;
    this.Y_POS = 0;
    this.car_yaw = 0;
  }
  move_right() {
    this.car_turn = 1;
  }
  move_left() {
    this.car_turn = -1;
  }

  movement(t){

    // if(this.car_acc_audio.currentTime===16) {
    //   this.car_acc_audio.pause();
    //   this.car_acc_audio.currentTime = 12;
    //   this.car_acc_audio.play();
    // }
    // When moving forward or backward
    if(this.car_acc_dir!==0){
      this.car_speed+=(this.car_acc*this.car_acc_dir);
      if(this.car_turn!==0){
        this.car_yaw -= (this.angle_inc*this.car_turn); // right if this.car_turn is 1 or left if this.car_turn is -1
        this.X_POS += (this.angle_inc*this.car_turn); // right if this.car_turn is 1 or left if this.car_turn is -1
        // this.car_speed-=(0.005*this.car_acc_dir);
      }
    }
    // When nothing is pressed
    else {
      if (this.car_speed > 0.05) {
        this.car_speed -= 0.1;
      }
      else if (this.car_speed < -0.05){
        this.car_speed += 0.1;
      }
      else {
        this.car_speed = 0;
      }
    }
    // Speed saturation
    
    if(this.car_speed<-this.car_speed_limit)
      this.car_speed = -this.car_speed_limit;
    if(this.car_speed>this.car_speed_limit)
      this.car_speed = this.car_speed_limit;
    // Actual car displacement
    this.Z_POS -= this.car_speed;
    
    this.car_transform = this.car_transform.times(Mat4.translation(this.X_POS, this.Y_POS, this.Z_POS))
        .times(Mat4.rotation(this.car_yaw, 0, 1, 0));
    this.Z_POS = 0;
    this.X_POS = 0;
    this.Y_POS = 0;
    this.car_yaw = 0;
  }


  make_control_panel() {
    // Add neccesary controls to make the game work
    this.key_triggered_button("World view", ["Control", "0"], () => this.attached = () => null);
    this.new_line();
    this.key_triggered_button("Car view", ["Control", "1"], () => this.attached = () => this.car);
    this.new_line();
    this.key_triggered_button("Move Forward", ["u"], this.move_forward,'#6E6460', this.default_acc);
    this.key_triggered_button("Move Backward", ["j"], this.move_backward,'#6E6460', this.default_acc);
    this.key_triggered_button("Move Right", ["k"], this.move_right,'#6E6460', this.default_turn);
    this.key_triggered_button("Move Left", ["h"], this.move_left,'#6E6460',  this.default_turn);
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
        desired = Mat4.inverse(this.attached().times(Mat4.translation(0, 0, 5)))
      desired = desired.map((x, i) =>
        Vector.from(program_state.camera_inverse[i]).mix(x, 0.5)
      )
      program_state.set_camera(desired)
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
    let arrow_transform = Mat4.identity()
    let car_transform = Mat4.identity()

    /* arrow_transform = arrow_transform.times(Mat4.translation(0, 3, 75));
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
    } */
    this.car_prev_Z_POS = this.car_Z_POS;
    let current_Z_POS = this.car_transform[2][3];
    this.car_Z_POS = current_Z_POS;
    let wheel_transform = Mat4.identity()
    let fender_transform = Mat4.identity()
    let carlight_trasform = Mat4.identity()
    let rear_front_transfrom = Mat4.identity()

    // draw the sky
    sky_transform = sky_transform
      .times(Mat4.scale(S_SCALE, S_SCALE, S_SCALE))
      .times(Mat4.translation(0, 0, ((current_Z_POS)) / S_SCALE))
    this.shapes.sphere.draw(
      context,
      program_state,
      sky_transform,
      this.materials.sky
    )
    // draw the ground
    ground_transform = ground_transform
      .times(Mat4.translation(0, 0, current_Z_POS))
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
    for (let i = 0; i < Math.floor(Math.abs(current_Z_POS) + 20); i++) {
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
      .times(Mat4.scale(A_SCALE, A_SCALE, A_SCALE * 0.5))
    for (let i = 0; i < 3; i++) {
      arch_transform = arch_transform.times(Mat4.translation(0, 0, -2))
      this.shapes.torus.draw(
        context,
        program_state,
        arch_transform,
        this.materials.stars
      )
    }
    arch_transform = arch_transform.times(Mat4.translation(0, 5, 0))
    this.shapes.cylinder.draw(
      context,
      program_state,
      arch_transform,
      this.materials.stars
    )

    // draw the car
    this.movement(program_state.animation_time / 1000);
    car_transform = this.car_transform.times(Mat4.translation(this.X_POS, this.Y_POS, this.Z_POS))
        .times(Mat4.rotation(this.car_yaw, 0, 1, 0));
    car_transform = car_transform.times(Mat4.rotation(Math.PI / 8, 0, 1, 0.0)).times(Mat4.translation(0, 0.6, 0))

    wheel_transform = car_transform.times(Mat4.translation(0, -0.4, 0 ))
    rear_front_transfrom = car_transform.times(Mat4.translation(0, -0.25, -0.02 ))//.times(Mat4.rotation(Math.PI / 25, 0, 0, 0))
    fender_transform = car_transform.times(Mat4.translation(0.5, -0.2, -1.15 )).times(Mat4.scale(0.2, 0.2, 0.2))
    carlight_trasform = car_transform.times(Mat4.translation(-0.02, 0, 0.1 )).times(Mat4.scale(1.325, 1.4, 1.325))

    this.shapes.body.draw(context, program_state, car_transform, this.materials.body_color);
    this.shapes.wheels.draw(context, program_state, wheel_transform, this.materials.tyre_color);
    this.shapes.fenders.draw(context, program_state, fender_transform, this.materials.fender_color);
    this.shapes.carlights.draw(context, program_state, carlight_trasform, this.materials.carlight_color);
    this.shapes.rear_front.draw(context, program_state, rear_front_transfrom, this.materials.rear_front_color);

    this.car = car_transform.times(Mat4.translation(0, 0.8, 0)).times(Mat4.rotation( Math.PI / 8, 0, -1, 0.0));

    this.generate_obstacles(program_state)
    // draw obstacles
    this.obstacles.forEach((element) => {
      this.shapes.roadblock.draw(
        context,
        program_state,
        element,
        this.materials.roadblock_color
      )
    })
    // Draw an extra bounding box around each drawn shape to show
    // the physical shape that is really being collided with:
    const { points, leeway } = this.colliders[this.collider_selection]
    // const size = vec3(1 + leeway, 1 + leeway, 1 + leeway)
    for (let b of this.bodies)
      points.draw(
        context,
        program_state,
        b.drawn_location,
        this.materials.sky,
        'LINE_STRIP'
      )

    // create a body for the car
    const car_body = new Body(
      this.shapes.body,
      undefined,
      vec3(1, 1, 1)
    ).emplace(
      this.car
        .times(Mat4.rotation(-Math.PI / 8, 0, 1, 0))
        .times(Mat4.scale(0.6, 1, 1)),
      vec3(0, 0, 0),
      0
    )
    car_body.inverse = Mat4.inverse(car_body.drawn_location)
    // draw bounding box for car
    points.draw(
      context,
      program_state,
      car_body.drawn_location,
      this.materials.sky,
      'LINE_STRIP'
    )
    this.check_collision(car_body)
  }

  generate_obstacles(program_state) {
    let roadblock_transform = Mat4.identity()
    if (
      Math.random() > 0.8 &&
      Math.floor(program_state.animation_time) % 5 === 0 &&
      this.car_Z_POS - this.car_prev_Z_POS !== 0 &&
      this.obstacles.length > 0 &&
      this.obstacles[this.obstacles.length - 1][2][3] - this.car[2][3] > -15
    ) {
      let side = -0.45
      if (Math.random() > 0.5) {
        side = 0.45
      }
      if (this.obstacles.length > 0) {
        roadblock_transform = roadblock_transform
          .times(Mat4.scale(RB_SCALE, RB_SCALE, RB_SCALE))
          .times(
            Mat4.translation(
              side * RB_SCALE,
              1 / RB_SCALE,
              (-40 + this.obstacles[this.obstacles.length - 1][2][3]) / RB_SCALE
            )
          )
      } else {
        roadblock_transform = roadblock_transform
          .times(Mat4.scale(RB_SCALE, RB_SCALE, RB_SCALE))
          .times(
            Mat4.translation(
              side * RB_SCALE,
              1 / RB_SCALE,
              (-20 + this.Z_POS) / RB_SCALE
            )
          )
      }
      this.obstacles.push(roadblock_transform)
      // represent an obstacle as a body
      this.bodies.push(
        new Body(this.shapes.roadblock, undefined, vec3(1, 1, 1)).emplace(
          roadblock_transform.times(Mat4.scale(1, 0.3, 0.15)),
          vec3(0, 0, 0),
          0
        )
      )
    }
  }

  check_collision(body) {
    // check if body is colliding with anybody in this.bodies

    const collider = this.colliders[this.collider_selection]
    // Loop through all bodies (call each "a"):
    for (let a of this.bodies) {
      // Cache the inverse of matrix of body "a" to save time.
      a.inverse = Mat4.inverse(a.drawn_location)

      // if (a.linear_velocity.norm() == 0) continue
      // *** Collision process is here ***
      if (!body.check_if_colliding(a, collider)) continue
      // If we get here, we collided
      const idx = this.bodies.indexOf(a)
      // remove the obstacle
      if (idx > -1) {
        this.bodies.splice(idx, 1)
        this.obstacles.splice(idx, 1)
      }
      // stop the car
      this.default_acc();
      this.car_speed = 0
      console.log('Collision detected')
    }
  }
}

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
