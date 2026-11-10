# Project a reference portrait onto the sculpted head: fit a camera to matching landmarks, then warp
# the remaining landmark error away with a thin-plate spline so eyes, nose and mouth land exactly.
import numpy as np
from PIL import Image, ImageFilter

def fit_affine(X3, x2):
    A = np.hstack([X3, np.ones((len(X3), 1))])
    M, *_ = np.linalg.lstsq(A, x2, rcond=None)      # 4x2
    return M

def tps_fit(src, dst, lam=1e-6):
    n = len(src)
    def U(r2): return np.where(r2 > 0, r2 * np.log(r2 + 1e-12), 0)
    d2 = ((src[:, None] - src[None]) ** 2).sum(-1)
    K = U(d2) + lam * np.eye(n); Pm = np.hstack([np.ones((n, 1)), src])
    L = np.zeros((n + 3, n + 3)); L[:n, :n] = K; L[:n, n:] = Pm; L[n:, :n] = Pm.T
    Y = np.zeros((n + 3, 2)); Y[:n] = dst
    w = np.linalg.solve(L, Y)
    def f(p):
        d2 = ((p[:, None] - src[None]) ** 2).sum(-1)
        return U(d2) @ w[:n] + np.hstack([np.ones((len(p), 1)), p]) @ w[n:]
    return f

def bilinear(img, x, y):
    h, w = img.shape[:2]
    x = np.clip(x, 0, w - 1.001); y = np.clip(y, 0, h - 1.001)
    x0 = np.floor(x).astype(int); y0 = np.floor(y).astype(int); fx = (x - x0)[..., None]; fy = (y - y0)[..., None]
    return (img[y0, x0] * (1 - fx) * (1 - fy) + img[y0, x0 + 1] * fx * (1 - fy) + img[y0 + 1, x0] * (1 - fx) * fy + img[y0 + 1, x0 + 1] * fx * fy)

class Projector:
    """landmarks: list of ((x, y, z) model, (px, py) photo). Visible side of the face is model -x."""
    def __init__(self, photo_path, landmarks):
        self.img = np.asarray(Image.open(photo_path).convert('RGB'), np.float32) / 255
        X3 = np.array([l[0] for l in landmarks], float); x2 = np.array([l[1] for l in landmarks], float)
        self.M = fit_affine(X3, x2)
        proj = np.hstack([X3, np.ones((len(X3), 1))]) @ self.M
        self.err = np.linalg.norm(proj - x2, axis=1)
        # residual warp in photo space: projected model landmark -> actual photo landmark
        self.warp = tps_fit(proj, x2, lam=.5)
    def sample(self, P):
        """P: (..., 3) model points on the visible (-x) side."""
        sh = P.shape[:-1]; p = P.reshape(-1, 3)
        q = np.hstack([p, np.ones((len(p), 1))]) @ self.M
        q = self.warp(q)
        return bilinear(self.img, q[:, 0], q[:, 1]).reshape(*sh, 3), q.reshape(*sh, 2)
