//! Frosted glass behind the island.
//!
//! CSS `backdrop-filter` only sees what the webview draws, never the desktop
//! behind the transparent island window. The DWM's own blur (the accent
//! policy, Acrylic, Mica) covers a window's whole rectangle: on Windows 11 it
//! ignores the window region, so it can't take the island's rounded shape.
//!
//! So the blur lives in a second, native window laid exactly over the island
//! window, right under it in the z-order. It shows Windows' host backdrop (the
//! blurred desktop behind it) through a composition visual clipped by an
//! anti-aliased Direct2D path of the island's outline. The frontend reports
//! that outline every frame it changes (`set_glass_shapes`) and tints it with
//! a translucent fill. Needs Windows 11 (`DWMWA_USE_HOSTBACKDROPBRUSH`).

use serde::Deserialize;

/// Part of the island's outline: a box in its own CSS px and the 2D
/// transform that places it in the island window (it follows the drag's
/// squash, skew and the bubbles' scale).
#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlassShape {
    pub width: f64,
    pub height: f64,
    /// Corner radii; the notch only rounds its bottom corners.
    #[serde(default)]
    pub radius_top: f64,
    #[serde(default)]
    pub radius_bottom: f64,
    #[serde(default)]
    pub kind: ShapeKind,
    /// `[a, b, c, d, e, f]`, as in CSS `matrix()`: a local point (x, y) lands
    /// on (a·x + c·y + e, b·x + d·y + f).
    pub transform: [f64; 6],
}

/// Concave "ears" fill a square except for a quarter circle on their outer
/// side; everything else is a (rounded) rectangle.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ShapeKind {
    #[default]
    Rect,
    EarLeft,
    EarRight,
}

/// A shape whose transform lands in physical px of the island window.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PhysicalShape {
    pub width: f32,
    pub height: f32,
    pub radius_top: f32,
    pub radius_bottom: f32,
    pub kind: ShapeKind,
    pub transform: [f32; 6],
}

impl PhysicalShape {
    /// Window-space box around the transformed shape: (left, top, right, bottom).
    pub fn bounds(&self) -> (f32, f32, f32, f32) {
        let [a, b, c, d, e, f] = self.transform;
        let corners = [
            (0.0, 0.0),
            (self.width, 0.0),
            (0.0, self.height),
            (self.width, self.height),
        ]
        .map(|(x, y)| (a * x + c * y + e, b * x + d * y + f));
        corners.iter().fold(
            (f32::MAX, f32::MAX, f32::MIN, f32::MIN),
            |(l, t, r, btm), &(x, y)| (l.min(x), t.min(y), r.max(x), btm.max(y)),
        )
    }

    /// Only scaled and moved (no skew or rotation).
    pub fn axis_aligned(&self) -> bool {
        self.transform[1].abs() < 1e-3 && self.transform[2].abs() < 1e-3
    }
}

/// The area the glass visual covers: around all the shapes, grown by `pad`
/// (room for the blur to sample past the outline, so its edges don't fade
/// in), in whole px: (x, y, width, height). The rest of the window isn't
/// blurred at all.
pub fn sprite_bounds(shapes: &[PhysicalShape], pad: f32) -> (f32, f32, f32, f32) {
    let (l, t, r, b) = shapes.iter().map(PhysicalShape::bounds).fold(
        (f32::MAX, f32::MAX, f32::MIN, f32::MIN),
        |(l, t, r, b), (sl, st, sr, sb)| (l.min(sl), t.min(st), r.max(sr), b.max(sb)),
    );
    if l > r {
        return (0.0, 0.0, 0.0, 0.0);
    }
    let (l, t) = ((l - pad).floor(), (t - pad).floor());
    let (r, b) = ((r + pad).ceil(), (b + pad).ceil());
    (l, t, r - l, b - t)
}

/// Moves the shapes' transforms to physical px (`scale` is the window's DPI
/// factor), dropping empty or flattened ones and keeping radii within half
/// the shorter side.
pub fn to_physical(shapes: &[GlassShape], scale: f64) -> Vec<PhysicalShape> {
    shapes
        .iter()
        .filter(|s| {
            let [a, b, c, d, ..] = s.transform;
            s.width >= 1.0 && s.height >= 1.0 && (a * d - b * c).abs() > 1e-3
        })
        .map(|s| {
            let max_r = s.width.min(s.height) / 2.0;
            PhysicalShape {
                width: s.width as f32,
                height: s.height as f32,
                radius_top: s.radius_top.clamp(0.0, max_r) as f32,
                radius_bottom: s.radius_bottom.clamp(0.0, max_r) as f32,
                kind: s.kind,
                transform: s.transform.map(|v| (v * scale) as f32),
            }
        })
        .collect()
}

/// How strongly the desktop behind the island is blurred.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum GlassLevel {
    Subtle,
    Moderate,
    Strong,
}

impl GlassLevel {
    /// Blur added on top of the system's own (fixed) backdrop blur: standard
    /// deviation in CSS px.
    pub fn extra_blur(self) -> f32 {
        match self {
            GlassLevel::Subtle => 0.0,
            GlassLevel::Moderate => 10.0,
            GlassLevel::Strong => 24.0,
        }
    }
}

// Both commands are sync on purpose: Tauri runs them on the main thread,
// where the composition objects live.

#[tauri::command]
pub fn set_glass_shapes(app: tauri::AppHandle, shapes: Vec<GlassShape>) {
    #[cfg(windows)]
    imp::apply(&app, &shapes);
    #[cfg(not(windows))]
    let _ = (app, shapes);
}

/// Whether the glass could be set up (Windows 11): the frontend hides the
/// option otherwise, rather than tinting the island with nothing behind it.
#[tauri::command]
pub fn glass_supported() -> bool {
    #[cfg(windows)]
    return imp::supported();
    #[cfg(not(windows))]
    false
}

#[tauri::command]
pub fn set_glass_level(app: tauri::AppHandle, level: GlassLevel) {
    #[cfg(windows)]
    imp::set_level(&app, level);
    #[cfg(not(windows))]
    let _ = (app, level);
}

#[cfg(windows)]
pub use imp::{restack, setup};

#[cfg(not(windows))]
pub fn setup(_: &tauri::AppHandle) {}

#[cfg(not(windows))]
pub fn restack() {}

#[cfg(windows)]
mod imp {
    use std::cell::{Cell, RefCell};
    use std::sync::Mutex;
    use std::sync::atomic::{AtomicIsize, Ordering};

    use tauri::{AppHandle, Manager};
    use windows::Foundation::{IPropertyValue, PropertyValue};
    use windows::Graphics::Effects::{
        IGraphicsEffect, IGraphicsEffect_Impl, IGraphicsEffectSource, IGraphicsEffectSource_Impl,
    };
    use windows::Graphics::{IGeometrySource2D, IGeometrySource2D_Impl};
    use windows::System::DispatcherQueueController;
    use windows::UI::Composition::Desktop::DesktopWindowTarget;
    use windows::UI::Composition::{
        CompositionBackdropBrush, CompositionBrush, CompositionEffectSourceParameter,
        CompositionGeometricClip, CompositionPath, Compositor, SpriteVisual,
    };
    use windows::Win32::Foundation::{
        E_BOUNDS, E_INVALIDARG, E_NOTIMPL, HWND, LPARAM, LRESULT, WPARAM,
    };
    use windows::Win32::Graphics::Direct2D::Common::{
        D2D_SIZE_F, D2D1_BORDER_MODE_HARD, D2D1_FIGURE_BEGIN_FILLED, D2D1_FIGURE_END_CLOSED,
        D2D1_FILL_MODE_WINDING,
    };
    use windows::Win32::Graphics::Direct2D::{
        CLSID_D2D1GaussianBlur, D2D1_ARC_SEGMENT, D2D1_ARC_SIZE_SMALL,
        D2D1_DIRECTIONALBLUR_OPTIMIZATION_BALANCED, D2D1_FACTORY_TYPE_SINGLE_THREADED,
        D2D1_SWEEP_DIRECTION, D2D1_SWEEP_DIRECTION_CLOCKWISE,
        D2D1_SWEEP_DIRECTION_COUNTER_CLOCKWISE, D2D1CreateFactory, ID2D1Factory, ID2D1Geometry,
        ID2D1GeometrySink,
    };
    use windows::Win32::Graphics::Dwm::{DWMWA_USE_HOSTBACKDROPBRUSH, DwmSetWindowAttribute};
    use windows::Win32::Graphics::Gdi::{
        CombineRgn, CreateRectRgn, CreateRoundRectRgn, DeleteObject, HRGN, RGN_OR, SetWindowRgn,
    };
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::System::WinRT::Composition::ICompositorDesktopInterop;
    use windows::Win32::System::WinRT::Graphics::Direct2D::{
        GRAPHICS_EFFECT_PROPERTY_MAPPING, IGeometrySource2DInterop, IGeometrySource2DInterop_Impl,
        IGraphicsEffectD2D1Interop, IGraphicsEffectD2D1Interop_Impl,
    };
    use windows::Win32::System::WinRT::{
        CreateDispatcherQueueController, DQTAT_COM_NONE, DQTYPE_THREAD_CURRENT,
        DispatcherQueueOptions,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DestroyWindow, HWND_TOPMOST, RegisterClassW,
        SET_WINDOW_POS_FLAGS, SW_HIDE, SWP_ASYNCWINDOWPOS, SWP_NOACTIVATE, SWP_NOMOVE,
        SWP_NOOWNERZORDER, SWP_NOSIZE, SWP_SHOWWINDOW, SetWindowPos, ShowWindow, WINDOW_EX_STYLE,
        WNDCLASSW, WS_EX_NOACTIVATE, WS_EX_NOREDIRECTIONBITMAP, WS_EX_TOOLWINDOW, WS_EX_TOPMOST,
        WS_POPUP,
    };
    use windows::core::{BOOL, GUID, HSTRING, Interface, PCWSTR, Ref, implement, w};
    use windows_numerics::{Matrix3x2, Vector2, Vector3};

    use super::{GlassLevel, GlassShape, PhysicalShape, ShapeKind, sprite_bounds, to_physical};
    use crate::window::ISLAND_LABEL;

    /// The glass window (0 until created), readable from any thread.
    static GLASS: AtomicIsize = AtomicIsize::new(0);
    /// The island window, to keep the glass right under it.
    static ISLAND: AtomicIsize = AtomicIsize::new(0);
    /// Last frame applied (window rect + outline), so unchanged frames cost nothing.
    static LAST: Mutex<Option<Frame>> = Mutex::new(None);

    #[derive(PartialEq)]
    struct Frame {
        rect: (i32, i32, i32, i32),
        shapes: Vec<PhysicalShape>,
    }

    /// Composition objects are tied to the main thread (its dispatcher queue).
    struct Scene {
        _queue: Option<DispatcherQueueController>,
        compositor: Compositor,
        _target: DesktopWindowTarget,
        sprite: SpriteVisual,
        /// The blurred desktop, as the system draws it.
        backdrop: CompositionBackdropBrush,
        clip: CompositionGeometricClip,
        d2d: ID2D1Factory,
        /// Margin (physical px) the blur needs around the outline.
        pad: Cell<f32>,
    }

    thread_local! {
        static SCENE: RefCell<Option<Scene>> = const { RefCell::new(None) };
    }

    /// Creates the (hidden) glass window and its visual. Must run on the main
    /// thread: its messages are pumped by the app's event loop.
    pub fn setup(app: &AppHandle) {
        let Some(island) = app.get_webview_window(ISLAND_LABEL) else {
            return;
        };
        let Ok(island) = island.hwnd() else {
            return;
        };
        ISLAND.store(island.0 as isize, Ordering::Relaxed);
        let Some(hwnd) = (unsafe { create_window() }) else {
            log::warn!("glass: could not create the backdrop window");
            return;
        };
        match unsafe { create_scene(hwnd) } {
            Ok(scene) => {
                SCENE.with(|s| *s.borrow_mut() = Some(scene));
                GLASS.store(hwnd.0 as isize, Ordering::Relaxed);
            }
            Err(e) => {
                log::warn!("glass: frosted glass unavailable: {e}");
                unsafe {
                    let _ = DestroyWindow(hwnd);
                }
            }
        }
    }

    unsafe extern "system" fn wnd_proc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) }
    }

    unsafe fn create_window() -> Option<HWND> {
        unsafe {
            let instance = GetModuleHandleW(None).ok()?;
            let class = w!("IslandGlass");
            let wc = WNDCLASSW {
                lpfnWndProc: Some(wnd_proc),
                hInstance: instance.into(),
                lpszClassName: class,
                ..Default::default()
            };
            RegisterClassW(&wc);
            // No GDI surface: the window's content is only the composition
            // visual. It takes clicks only inside its region (the island's
            // outline), where the island is on top anyway.
            let ex =
                WS_EX_NOREDIRECTIONBITMAP | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_TOPMOST;
            CreateWindowExW(
                WINDOW_EX_STYLE(ex.0),
                class,
                w!("Island glass"),
                WS_POPUP,
                0,
                0,
                1,
                1,
                None,
                None,
                Some(instance.into()),
                None,
            )
            .ok()
        }
    }

    unsafe fn create_scene(hwnd: HWND) -> windows::core::Result<Scene> {
        unsafe {
            // The host backdrop brush draws nothing for a Win32 window unless it
            // opts in; the attribute only exists on Windows 11.
            let on = BOOL::from(true);
            DwmSetWindowAttribute(
                hwnd,
                DWMWA_USE_HOSTBACKDROPBRUSH,
                (&on as *const BOOL).cast(),
                std::mem::size_of::<BOOL>() as u32,
            )?;
            // A compositor needs a dispatcher queue on its thread; if the
            // thread already has one, creating another fails and that's fine.
            let queue = CreateDispatcherQueueController(DispatcherQueueOptions {
                dwSize: std::mem::size_of::<DispatcherQueueOptions>() as u32,
                threadType: DQTYPE_THREAD_CURRENT,
                apartmentType: DQTAT_COM_NONE,
            })
            .ok();
            let compositor = Compositor::new()?;
            let target = compositor
                .cast::<ICompositorDesktopInterop>()?
                .CreateDesktopWindowTarget(hwnd, false)?;
            let sprite = compositor.CreateSpriteVisual()?;
            let backdrop = compositor.CreateHostBackdropBrush()?;
            sprite.SetBrush(&backdrop)?;
            let clip = compositor.CreateGeometricClip()?;
            sprite.SetClip(&clip)?;
            target.SetRoot(&sprite)?;
            let d2d = D2D1CreateFactory::<ID2D1Factory>(D2D1_FACTORY_TYPE_SINGLE_THREADED, None)?;
            Ok(Scene {
                _queue: queue,
                compositor,
                _target: target,
                sprite,
                backdrop,
                clip,
                d2d,
                pad: Cell::new(0.0),
            })
        }
    }

    /// A Direct2D effect described for composition: what Win2D's effect
    /// classes do in C#. Composition reads the effect id, its properties (in
    /// the effect's own index order) and its sources.
    #[implement(IGraphicsEffect, IGraphicsEffectSource, IGraphicsEffectD2D1Interop)]
    struct Effect {
        id: GUID,
        properties: Vec<IPropertyValue>,
        sources: Vec<IGraphicsEffectSource>,
        name: RefCell<HSTRING>,
    }

    impl IGraphicsEffectSource_Impl for Effect_Impl {}

    impl IGraphicsEffect_Impl for Effect_Impl {
        fn Name(&self) -> windows::core::Result<HSTRING> {
            Ok(self.name.borrow().clone())
        }

        fn SetName(&self, name: &HSTRING) -> windows::core::Result<()> {
            *self.name.borrow_mut() = name.clone();
            Ok(())
        }
    }

    impl IGraphicsEffectD2D1Interop_Impl for Effect_Impl {
        fn GetEffectId(&self) -> windows::core::Result<GUID> {
            Ok(self.id)
        }

        // Only asked for properties that get animated, and none are.
        fn GetNamedPropertyMapping(
            &self,
            _name: &PCWSTR,
            _index: *mut u32,
            _mapping: *mut GRAPHICS_EFFECT_PROPERTY_MAPPING,
        ) -> windows::core::Result<()> {
            Err(E_INVALIDARG.into())
        }

        fn GetPropertyCount(&self) -> windows::core::Result<u32> {
            Ok(self.properties.len() as u32)
        }

        fn GetProperty(&self, index: u32) -> windows::core::Result<IPropertyValue> {
            self.properties
                .get(index as usize)
                .cloned()
                .ok_or_else(|| E_BOUNDS.into())
        }

        fn GetSource(&self, index: u32) -> windows::core::Result<IGraphicsEffectSource> {
            self.sources
                .get(index as usize)
                .cloned()
                .ok_or_else(|| E_BOUNDS.into())
        }

        fn GetSourceCount(&self) -> windows::core::Result<u32> {
            Ok(self.sources.len() as u32)
        }
    }

    /// The backdrop with `deviation` px of Gaussian blur on top.
    fn blurred(scene: &Scene, deviation: f32) -> windows::core::Result<CompositionBrush> {
        const SOURCE: &str = "backdrop";
        let float = |v: f32| PropertyValue::CreateSingle(v)?.cast::<IPropertyValue>();
        let uint = |v: u32| PropertyValue::CreateUInt32(v)?.cast::<IPropertyValue>();
        let blur: IGraphicsEffect = Effect {
            id: CLSID_D2D1GaussianBlur,
            // Standard deviation, optimization, border mode. A hard border
            // keeps the window's edges (the top of the screen) from fading.
            properties: vec![
                float(deviation)?,
                uint(D2D1_DIRECTIONALBLUR_OPTIMIZATION_BALANCED.0 as u32)?,
                uint(D2D1_BORDER_MODE_HARD.0 as u32)?,
            ],
            sources: vec![CompositionEffectSourceParameter::Create(&SOURCE.into())?.cast()?],
            name: RefCell::default(),
        }
        .into();
        let brush = scene.compositor.CreateEffectFactory(&blur)?.CreateBrush()?;
        brush.SetSourceParameter(&SOURCE.into(), &scene.backdrop)?;
        brush.cast()
    }

    pub fn set_level(app: &AppHandle, level: GlassLevel) {
        let scale = app
            .get_webview_window(ISLAND_LABEL)
            .and_then(|w| w.scale_factor().ok())
            .unwrap_or(1.0) as f32;
        SCENE.with(|scene| {
            let scene = scene.borrow();
            let Some(scene) = scene.as_ref() else {
                return;
            };
            let deviation = level.extra_blur() * scale;
            let brush = if deviation > 0.0 {
                blurred(scene, deviation)
            } else {
                scene.backdrop.cast()
            };
            if let Err(e) = brush.and_then(|b| scene.sprite.SetBrush(&b)) {
                log::warn!("glass: could not change the blur: {e}");
            }
            // A Gaussian blur reaches about 3 deviations out.
            scene.pad.set((deviation * 3.0).ceil());
            if let Some(last) = LAST.lock().unwrap().as_ref() {
                let _ = unsafe { set_outline(scene, &last.shapes) };
            }
        });
    }

    /// Hands a Direct2D geometry to composition, which reads it through these
    /// two interfaces.
    #[implement(IGeometrySource2D, IGeometrySource2DInterop)]
    struct GeometrySource(ID2D1Geometry);

    impl IGeometrySource2D_Impl for GeometrySource_Impl {}

    impl IGeometrySource2DInterop_Impl for GeometrySource_Impl {
        fn GetGeometry(&self) -> windows::core::Result<ID2D1Geometry> {
            Ok(self.0.clone())
        }

        fn TryGetGeometryUsingFactory(
            &self,
            _factory: Ref<ID2D1Factory>,
        ) -> windows::core::Result<ID2D1Geometry> {
            Err(E_NOTIMPL.into())
        }
    }

    fn v(x: f32, y: f32) -> Vector2 {
        Vector2 { X: x, Y: y }
    }

    /// Goes to `to` along an arc of radius `r` (a straight line when 0).
    unsafe fn arc_to(sink: &ID2D1GeometrySink, to: Vector2, r: f32, sweep: D2D1_SWEEP_DIRECTION) {
        unsafe {
            if r <= 0.0 {
                sink.AddLine(to);
                return;
            }
            sink.AddArc(&D2D1_ARC_SEGMENT {
                point: to,
                size: D2D_SIZE_F {
                    width: r,
                    height: r,
                },
                rotationAngle: 0.0,
                sweepDirection: sweep,
                arcSize: D2D1_ARC_SIZE_SMALL,
            });
        }
    }

    unsafe fn figure(sink: &ID2D1GeometrySink, s: &PhysicalShape) {
        use D2D1_SWEEP_DIRECTION_CLOCKWISE as CW;
        use D2D1_SWEEP_DIRECTION_COUNTER_CLOCKWISE as CCW;
        let (l, t, r, b) = (0.0, 0.0, s.width, s.height);
        unsafe {
            match s.kind {
                ShapeKind::Rect => {
                    let (rt, rb) = (s.radius_top, s.radius_bottom);
                    sink.BeginFigure(v(l + rt, t), D2D1_FIGURE_BEGIN_FILLED);
                    sink.AddLine(v(r - rt, t));
                    arc_to(sink, v(r, t + rt), rt, CW);
                    sink.AddLine(v(r, b - rb));
                    arc_to(sink, v(r - rb, b), rb, CW);
                    sink.AddLine(v(l + rb, b));
                    arc_to(sink, v(l, b - rb), rb, CW);
                    sink.AddLine(v(l, t + rt));
                    arc_to(sink, v(l + rt, t), rt, CW);
                }
                // The quarter circle centered on the outer bottom corner is left out.
                ShapeKind::EarLeft => {
                    let radius = (r - l).min(b - t);
                    sink.BeginFigure(v(l, t), D2D1_FIGURE_BEGIN_FILLED);
                    sink.AddLine(v(r, t));
                    sink.AddLine(v(r, b));
                    sink.AddLine(v(l + radius, b));
                    arc_to(sink, v(l, b - radius), radius, CCW);
                }
                ShapeKind::EarRight => {
                    let radius = (r - l).min(b - t);
                    sink.BeginFigure(v(l, t), D2D1_FIGURE_BEGIN_FILLED);
                    sink.AddLine(v(r, t));
                    sink.AddLine(v(r, b - radius));
                    arc_to(sink, v(r - radius, b), radius, CCW);
                    sink.AddLine(v(l, b));
                }
            }
            sink.EndFigure(D2D1_FIGURE_END_CLOSED);
        }
    }

    /// Sizes the visual around the shapes and clips it to their outline.
    unsafe fn set_outline(scene: &Scene, shapes: &[PhysicalShape]) -> windows::core::Result<()> {
        unsafe {
            let (x, y, w, h) = sprite_bounds(shapes, scene.pad.get());
            scene.sprite.SetOffset(Vector3 { X: x, Y: y, Z: 0.0 })?;
            scene.sprite.SetSize(Vector2 { X: w, Y: h })?;
            // Each shape is drawn in its own px, then put in place by its
            // transform, in the visual's space.
            let mut parts = Vec::with_capacity(shapes.len());
            for s in shapes {
                let path = scene.d2d.CreatePathGeometry()?;
                let sink = path.Open()?;
                figure(&sink, s);
                sink.Close()?;
                let [a, b, c, d, e, f] = s.transform;
                let m = Matrix3x2 {
                    M11: a,
                    M12: b,
                    M21: c,
                    M22: d,
                    M31: e - x,
                    M32: f - y,
                };
                parts.push(Some(
                    scene.d2d.CreateTransformedGeometry(&path, &m)?.cast()?,
                ));
            }
            let group = scene
                .d2d
                .CreateGeometryGroup(D2D1_FILL_MODE_WINDING, &parts)?;
            let source: IGeometrySource2D = GeometrySource(group.cast()?).into();
            let path = CompositionPath::Create(&source)?;
            let geometry = scene.compositor.CreatePathGeometryWithPath(&path)?;
            scene.clip.SetGeometry(&geometry)
        }
    }

    /// Where the glass takes clicks: the outline grown by a pixel, so the
    /// (aliased) region never cuts into the anti-aliased edge.
    unsafe fn hit_region(shapes: &[PhysicalShape]) -> HRGN {
        unsafe {
            let all = CreateRectRgn(0, 0, 0, 0);
            for s in shapes {
                let (l, t, r, b) = s.bounds();
                let (l, t) = (l.floor() as i32 - 1, t.floor() as i32 - 1);
                let (r, b) = (r.ceil() as i32 + 1, b.ceil() as i32 + 1);
                // Skewed (dragged) shapes take their whole box: it's brief.
                let radius = match s.kind {
                    ShapeKind::Rect if s.axis_aligned() => {
                        let scale = s.transform[0].min(s.transform[3]);
                        (s.radius_top.min(s.radius_bottom) * scale).round() as i32
                    }
                    _ => 0,
                };
                let part = if radius > 0 {
                    CreateRoundRectRgn(l, t, r + 1, b + 1, radius * 2, radius * 2)
                } else {
                    CreateRectRgn(l, t, r, b)
                };
                CombineRgn(Some(all), Some(all), Some(part), RGN_OR);
                let _ = DeleteObject(part.into());
            }
            all
        }
    }

    pub fn supported() -> bool {
        glass().is_some()
    }

    fn glass() -> Option<HWND> {
        let raw = GLASS.load(Ordering::Relaxed);
        (raw != 0).then_some(HWND(raw as *mut _))
    }

    fn island() -> HWND {
        HWND(ISLAND.load(Ordering::Relaxed) as *mut _)
    }

    fn hide(glass: HWND) {
        if LAST.lock().unwrap().take().is_some() {
            unsafe {
                let _ = ShowWindow(glass, SW_HIDE);
            }
        }
    }

    pub fn apply(app: &AppHandle, shapes: &[GlassShape]) {
        let Some(glass) = glass() else {
            return;
        };
        let Some(win) = app.get_webview_window(ISLAND_LABEL) else {
            return hide(glass);
        };
        let visible = win.is_visible().unwrap_or(false);
        let (Ok(pos), Ok(size), Ok(scale)) =
            (win.outer_position(), win.outer_size(), win.scale_factor())
        else {
            return hide(glass);
        };
        let shapes = to_physical(shapes, scale);
        if !visible || shapes.is_empty() {
            return hide(glass);
        }
        let next = Frame {
            rect: (pos.x, pos.y, size.width as i32, size.height as i32),
            shapes,
        };

        let mut last = LAST.lock().unwrap();
        if last.as_ref() == Some(&next) {
            return;
        }
        let shaped = SCENE.with(|scene| match scene.borrow().as_ref() {
            Some(scene) => unsafe { set_outline(scene, &next.shapes) }
                .inspect_err(|e| log::warn!("glass: could not shape the backdrop: {e}"))
                .is_ok(),
            None => false,
        });
        if !shaped {
            return;
        }
        unsafe {
            // The window owns the region from here on.
            SetWindowRgn(glass, Some(hit_region(&next.shapes)), false);
            // Same rect as the island window, which rarely moves: the outline
            // changes, the window doesn't, so the two can't drift apart.
            if last.as_ref().is_none_or(|l| l.rect != next.rect) {
                let (x, y, w, h) = next.rect;
                let _ = SetWindowPos(
                    glass,
                    Some(island()),
                    x,
                    y,
                    w,
                    h,
                    SWP_NOACTIVATE | SWP_NOOWNERZORDER | SWP_SHOWWINDOW,
                );
            }
        }
        *last = Some(next);
    }

    /// Puts the glass back right under the island after the island was raised.
    pub fn restack() {
        let Some(glass) = glass() else {
            return;
        };
        if LAST.lock().unwrap().is_none() {
            return;
        }
        let flags: SET_WINDOW_POS_FLAGS =
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOOWNERZORDER | SWP_ASYNCWINDOWPOS;
        unsafe {
            // Topmost first, in case it fell out of the band with the island.
            let _ = SetWindowPos(glass, Some(HWND_TOPMOST), 0, 0, 0, 0, flags);
            let _ = SetWindowPos(glass, Some(island()), 0, 0, 0, 0, flags);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn shape(width: f64, height: f64, transform: [f64; 6]) -> GlassShape {
        GlassShape {
            width,
            height,
            radius_top: 0.0,
            radius_bottom: 0.0,
            kind: ShapeKind::Rect,
            transform,
        }
    }

    const MOVED: [f64; 6] = [1.0, 0.0, 0.0, 1.0, 100.0, 4.0];

    #[test]
    fn empty_or_flat_shapes_are_dropped() {
        assert!(to_physical(&[], 1.0).is_empty());
        assert!(to_physical(&[shape(0.0, 20.0, MOVED)], 1.0).is_empty());
        // Scaled to nothing (a bubble popping in).
        assert!(to_physical(&[shape(20.0, 20.0, [0.0, 0.0, 0.0, 0.0, 5.0, 5.0])], 1.0).is_empty());
    }

    #[test]
    fn transform_moves_to_physical_px() {
        let p = to_physical(&[shape(200.0, 40.0, MOVED)], 1.5);
        assert_eq!(p[0].transform, [1.5, 0.0, 0.0, 1.5, 150.0, 6.0]);
        assert_eq!(p[0].bounds(), (150.0, 6.0, 450.0, 66.0));
        assert!(p[0].axis_aligned());
    }

    #[test]
    fn skewed_bounds_cover_the_slanted_corners() {
        // skewX: the bottom edge shifts right by 0.5 px per px of height.
        let p = to_physical(&[shape(100.0, 20.0, [1.0, 0.0, 0.5, 1.0, 0.0, 0.0])], 1.0);
        assert_eq!(p[0].bounds(), (0.0, 0.0, 110.0, 20.0));
        assert!(!p[0].axis_aligned());
    }

    #[test]
    fn radii_are_clamped_to_half_the_short_side() {
        let mut s = shape(100.0, 20.0, MOVED);
        s.radius_bottom = 50.0;
        s.radius_top = -3.0;
        let p = to_physical(&[s], 2.0);
        assert_eq!((p[0].radius_top, p[0].radius_bottom), (0.0, 10.0));
    }

    #[test]
    fn sprite_covers_all_shapes_plus_the_blur_margin() {
        let p = to_physical(
            &[
                shape(100.0, 20.0, [1.0, 0.0, 0.0, 1.0, 50.5, 4.0]),
                shape(10.0, 10.0, [1.0, 0.0, 0.0, 1.0, 30.0, 4.0]),
            ],
            1.0,
        );
        assert_eq!(sprite_bounds(&p, 0.0), (30.0, 4.0, 121.0, 20.0));
        assert_eq!(sprite_bounds(&p, 6.0), (24.0, -2.0, 133.0, 32.0));
        assert_eq!(sprite_bounds(&[], 6.0), (0.0, 0.0, 0.0, 0.0));
    }

    #[test]
    fn levels_blur_more_as_they_go_up() {
        let levels: Vec<GlassLevel> =
            serde_json::from_str(r#"["subtle","moderate","strong"]"#).unwrap();
        let blur: Vec<f32> = levels.iter().map(|l| l.extra_blur()).collect();
        assert_eq!(blur[0], 0.0);
        assert!(blur[0] < blur[1] && blur[1] < blur[2]);
    }

    #[test]
    fn shapes_parse_from_the_frontend() {
        let s: GlassShape = serde_json::from_str(
            r#"{"width":3,"height":4,"radiusTop":0,"radiusBottom":2,"kind":"earLeft","transform":[1,0,0,1,5,6]}"#,
        )
        .unwrap();
        assert_eq!(s.kind, ShapeKind::EarLeft);
        let s: GlassShape =
            serde_json::from_str(r#"{"width":3,"height":4,"transform":[1,0,0,1,0,0]}"#).unwrap();
        assert_eq!(s.kind, ShapeKind::Rect);
    }
}
