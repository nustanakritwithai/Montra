# photo landmarks (pixel coords in the reference image) and their model-space anchors (x, y; z from the surface)
PHOTO_LM = {
 'reye_out': (1272.5, 272.5), 'reye_in': (1327.5, 281), 'reye_c': (1297.5, 274),
 'leye_in': (1390, 291), 'leye_c': (1406, 290),
 'nose_tip': (1372.5, 360), 'subnasale': (1365, 377.5), 'ralar': (1332.5, 370),
 'mouth_r': (1280, 425), 'mouth_c': (1350, 426.5), 'mouth_l': (1400, 427.5),
 'chin': (1335, 517.5), 'rbrow_in': (1340, 250), 'glabella': (1372, 256), 'rbrow_out': (1260, 235), 'bridge': (1357.5, 282.5),
}
MODEL_LM = {
 'reye_out': (-.0464, 1.6328), 'reye_in': (-.0216, 1.6316), 'reye_c': (-.034, 1.632),
 'leye_in': (.0216, 1.6316), 'leye_c': (.034, 1.632),
 'nose_tip': (0, 1.5965), 'subnasale': (0, 1.5875), 'ralar': (-.0165, 1.5915),
 'mouth_r': (-.0225, 1.5650), 'mouth_c': (0, 1.5665), 'mouth_l': (.0225, 1.5650),
 'chin': (0, 1.5320), 'rbrow_in': (-.0125, 1.6450), 'glabella': (0, 1.6455), 'rbrow_out': (-.055, 1.6435), 'bridge': (0, 1.6330),
}
