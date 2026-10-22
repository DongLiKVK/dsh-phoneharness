package com.lc.phoneharness;

import android.animation.TimeInterpolator;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.os.SystemClock;
import android.view.View;

/**
 * 会话「进行中」状态环 —— 复刻主机 harness（DSH Web GUI）侧栏会话行左侧的转圈动效。
 *
 * <p>主机侧的实现是一个 24 单位见方的 SVG（见 app.asar 内
 * node_modules/@deepseek-ai/dsh-web-frontend/dist/assets/index-CN7NIWNw.js 的 Spinner 组件）：
 * viewBox="0 0 24 24"，两个 circle cx=12 cy=12 r=9.5，类名 spinnerMotion / spinnerTrack / spinnerArc；
 * ongoing 默认 14px，其余状态点 10px，颜色取 --dsw-alias-label-tertiary。
 * 同目录 index-BxpfOGf3.css 的规则（逐字）：
 *
 * <pre>
 * ._spinnerMotion_1i3xo_42{transform-origin:center;animation:_dsh-state-dot-spin_1i3xo_1 1.5s linear infinite}
 * ._spinnerTrack_1i3xo_47,._spinnerArc_1i3xo_48{fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}
 * ._spinnerTrack_1i3xo_47{opacity:.25}
 * ._spinnerArc_1i3xo_48{stroke-dasharray:12 150;animation:_dsh-state-dot-dash_1i3xo_1 1.5s ease-in-out infinite}
 * &#64;keyframes _dsh-state-dot-spin_1i3xo_1{to{transform:rotate(360deg)}}
 * &#64;keyframes _dsh-state-dot-dash_1i3xo_1{
 *   0%{stroke-dasharray:12 150;stroke-dashoffset:0}
 *   50%{stroke-dasharray:24 150;stroke-dashoffset:-6}
 *   to{stroke-dasharray:12 150;stroke-dashoffset:0}}
 * &#64;media(prefers-reduced-motion:reduce){
 *   ._spinnerMotion_1i3xo_42,._spinnerArc_1i3xo_48{animation:none}
 *   ._spinnerArc_1i3xo_48{stroke-dasharray:18 150;stroke-dashoffset:-3}}
 * </pre>
 *
 * <p>搬进 Canvas 时保持三件事不变，否则「看起来一样」也只是巧合：
 * <ol>
 *   <li>几何：半径 9.5 / 描边 2 / 边长 24 全部按 viewBox 单位换算，不做「差不多」的四舍五入；</li>
 *   <li>时间：整组旋转与弧长呼吸同为 1.5s 一条时间轴（{@link Motion#DUR_HOST_SPIN_LOOP}），
 *       旋转线性、弧长 ease-in-out；</li>
 *   <li>相位：主机的 Spinner 把每条 CSS 动画的 startTime 归 0（HD()），所以屏幕上多个环永远同相。
 *       这里用类加载时刻作为全局基准 {@link #EPOCH}，列表重建也不会重新从 0 起步。</li>
 * </ol>
 *
 * <p>颜色：主机用 label-tertiary；本工程最接近的是 {@code Theme.muted}（浅 #7D7F85 / 深 #B9BABB），
 * 与主机 #81858c / #adb2b8 同档，不再新造颜色。
 */
public final class StateRing extends View {

    /** viewBox 边长（SVG 的 24 单位）。 */
    private static final float BOX = 24f;
    /** 圆的半径（SVG r=9.5）。 */
    private static final float RADIUS = 9.5f;
    /** 描边宽度（SVG stroke-width:2）。 */
    private static final float STROKE = 2f;
    /** 圆周长 2πr = 59.69026…；dasharray 的长度单位就是沿路径的弧长。 */
    private static final float LENGTH = (float) (2d * Math.PI * RADIUS);
    /** dasharray 的实线段：静止 12 → 中点 24 → 收尾回 12（gap 恒为 150，等价「只剩一段」）。 */
    private static final float DASH_ON_MIN = 12f;
    private static final float DASH_ON_MAX = 24f;
    /** 中点 dashoffset -6（负值 = 图案沿路径前进方向前移 6 单位）。 */
    private static final float DASH_OFFSET_MID = -6f;
    /** 整圆的轨道透明度（CSS opacity:.25）。 */
    private static final int TRACK_ALPHA = 64;
    /** 减少动效分支的静态形：dasharray 18 150 / dashoffset -3。 */
    private static final float DASH_ON_STILL = 18f;
    private static final float DASH_OFFSET_STILL = -3f;
    /** 默认直径 14dp（主机 ongoing 的默认 size）。 */
    private static final float SIZE_DP = 14f;

    /**
     * 全局相位基准：与主机的 startTime=0 等价 —— 同一屏上的环永远同一拍，列表重建也不跳相。
     * 用 uptimeMillis 而不是墙钟，避免系统校时造成一次跳帧。
     */
    private static final long EPOCH = SystemClock.uptimeMillis();

    private final Paint trackPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint arcPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF oval = new RectF();
    private final float sizePx;
    /** 系统「动画时长缩放」为 0（减少动效）：只画静态弧，不排下一帧。 */
    private final boolean still;
    private final TimeInterpolator dashEase = Motion.EASE_SHIMMER;

    public StateRing(Context context, Theme theme) {
        super(context);
        sizePx = theme.dp(SIZE_DP);
        still = Motion.reducedMotion(context);
        int color = theme.muted;
        trackPaint.setStyle(Paint.Style.STROKE);
        trackPaint.setStrokeCap(Paint.Cap.ROUND);
        trackPaint.setColor(color);
        trackPaint.setAlpha(TRACK_ALPHA);
        arcPaint.setStyle(Paint.Style.STROKE);
        arcPaint.setStrokeCap(Paint.Cap.ROUND);
        arcPaint.setColor(color);
        // 主机把这个 svg 标了 aria-hidden="true"：它对读屏器是纯装饰，状态由行本身的语义承担。
        setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
        setFocusable(false);
    }

    @Override
    protected void onMeasure(int widthSpec, int heightSpec) {
        int want = Math.round(sizePx);
        // 宿主给的是固定槽宽（20dp），比环本身（14dp）宽 —— 必须**吃满**宿主给的尺寸，
        // 由 onDraw 把 14dp 的环在槽里居中。若在这里硬写 42px（14dp），环的出现/消失会让
        // 同一行标题左右跳 6dp（实测 registry：有环 x=123 / 无环 x=141），正是空位占位要解决的问题。
        setMeasuredDimension(resolve(widthSpec, want), resolve(heightSpec, want));
    }

    private static int resolve(int spec, int want) {
        int mode = View.MeasureSpec.getMode(spec);
        int size = View.MeasureSpec.getSize(spec);
        if (mode == View.MeasureSpec.EXACTLY) return size;
        if (mode == View.MeasureSpec.AT_MOST) return Math.min(size, want);
        return want;
    }

    @Override
    protected void onDraw(Canvas canvas) {
        int view = Math.min(getWidth(), getHeight());
        if (view <= 0) return;
        // 不可见（抽屉收起 / 行被回收）时不排帧：onDraw 一旦不再被调用，动画自然停，回到可见由
        // onVisibilityChanged 再踢一脚。
        if (!isShown()) return;

        float diameter = Math.min(sizePx, view);
        float scale = diameter / BOX;
        float radius = RADIUS * scale;
        float stroke = STROKE * scale;
        float cx = getWidth() / 2f;
        float cy = getHeight() / 2f;
        trackPaint.setStrokeWidth(stroke);
        arcPaint.setStrokeWidth(stroke);
        oval.set(cx - radius, cy - radius, cx + radius, cy + radius);

        float on;
        float offset;
        float angle;
        if (still) {
            on = DASH_ON_STILL;
            offset = DASH_OFFSET_STILL;
            angle = 0f;
        } else {
            long now = SystemClock.uptimeMillis();
            float phase = ((now - EPOCH) % Motion.DUR_HOST_SPIN_LOOP) / (float) Motion.DUR_HOST_SPIN_LOOP;
            angle = phase * 360f;
            if (phase < 0.5f) {
                float eased = dashEase.getInterpolation(phase * 2f);
                on = DASH_ON_MIN + (DASH_ON_MAX - DASH_ON_MIN) * eased;
                offset = DASH_OFFSET_MID * eased;
            } else {
                float eased = dashEase.getInterpolation((phase - 0.5f) * 2f);
                on = DASH_ON_MAX - (DASH_ON_MAX - DASH_ON_MIN) * eased;
                offset = DASH_OFFSET_MID * (1f - eased);
            }
        }

        canvas.save();
        canvas.rotate(angle, cx, cy);
        canvas.drawOval(oval, trackPaint);
        // SVG 的圆路径起点在 3 点钟方向、顺时针，和 drawArc 的 0° / 正扫描方向一致；
        // dashoffset 为负表示图案沿路径前移，所以起点角 = -offset/周长 × 360。
        float start = -offset / LENGTH * 360f;
        float sweep = on / LENGTH * 360f;
        canvas.drawArc(oval, start, sweep, false, arcPaint);
        canvas.restore();

        if (!still) postInvalidateOnAnimation();
    }

    @Override
    protected void onVisibilityChanged(View changed, int visibility) {
        super.onVisibilityChanged(changed, visibility);
        if (visibility == VISIBLE && !still) postInvalidateOnAnimation();
    }

    @Override
    protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        if (!still) postInvalidateOnAnimation();
    }
}
