import bpy
import sys
import os

def bake_texture():
    # In Blender headless, sys.argv includes the blender executable and args.
    # The custom args come after "--"
    try:
        args_idx = sys.argv.index("--")
        input_image_path = sys.argv[args_idx + 1]
        output_image_path = sys.argv[args_idx + 2]
    except (ValueError, IndexError):
        print("Usage: blender -b template.blend -P blender_bake.py -- <input_image> <output_image>")
        sys.exit(1)

    print(f"--- Starting Blender Bake ---")
    print(f"Input image: {input_image_path}")
    print(f"Output image: {output_image_path}")

    # 1. Load the downloaded image
    if not os.path.exists(input_image_path):
        print(f"Error: Input image {input_image_path} not found.")
        sys.exit(1)
        
    try:
        img = bpy.data.images.load(input_image_path)
    except Exception as e:
        print(f"Error loading image: {e}")
        sys.exit(1)

    # 2. Find the target object and material
    # (Assuming the .blend file has an active object ready for baking)
    obj = bpy.context.active_object
    if not obj or obj.type != 'MESH':
        # Fallback to the first mesh object if no active object
        for o in bpy.context.scene.objects:
            if o.type == 'MESH':
                obj = o
                bpy.context.view_layer.objects.active = obj
                break
                
    if not obj:
        print("Error: No mesh object found in the scene to bake to.")
        sys.exit(1)

    # Ensure the object is selected
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)

    # 3. Assign the image to the projection material node
    # Note: This assumes you have an Image Texture node in your material.
    if obj.active_material and obj.active_material.node_tree:
        nodes = obj.active_material.node_tree.nodes
        tex_node = None
        
        # Look for a specifically named node first, or any image texture node
        for node in nodes:
            if node.type == 'TEX_IMAGE':
                tex_node = node
                break
        
        if tex_node:
            tex_node.image = img
            print("Successfully assigned input image to material node.")
        else:
            print("Warning: Could not find an Image Texture node to assign the input image to.")
    else:
        print("Warning: Active object has no material or node tree.")

    # 4. Create the target bake image
    # Assuming 2048x2048 for CS2 weapons, adjust as needed
    bake_img = bpy.data.images.new("BakeResult", width=2048, height=2048)
    
    # 5. Assign bake image to a selected, active image texture node in the material 
    # (Blender's bake system requires the target image node to be ACTIVE)
    if obj.active_material and obj.active_material.node_tree:
        bake_node = obj.active_material.node_tree.nodes.new('ShaderNodeTexImage')
        bake_node.name = "BakeTarget"
        bake_node.image = bake_img
        bake_node.select = True
        obj.active_material.node_tree.nodes.active = bake_node

    # 6. Perform the Bake (Cycles required)
    bpy.context.scene.render.engine = 'CYCLES'
    
    # We bake the color projection without lighting (Emit or Diffuse Color only)
    bpy.context.scene.cycles.bake_type = 'DIFFUSE'
    bpy.context.scene.render.bake.use_pass_direct = False
    bpy.context.scene.render.bake.use_pass_indirect = False
    bpy.context.scene.render.bake.use_pass_color = True
    
    print("Baking projection...")
    try:
        bpy.ops.object.bake(type='DIFFUSE', save_mode='EXTERNAL')
        
        # 7. Save the resulting baked image
        bake_img.filepath_raw = output_image_path
        bake_img.file_format = 'PNG'
        bake_img.save()
        print(f"Bake saved successfully to {output_image_path}")
    except Exception as e:
        print(f"Bake failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    bake_texture()
