package com.lc.phoneharness;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.view.View;

/**
 * 会话「已完成」状态点 —— 复刻主机 harness（DSH Web GUI）侧栏会话行左侧的圆点。
 *
 * <p>主机侧同一个 Spinner 组件在非 ongoing 状态下渲染的是一个 10px 见方的 span
 * （app.asar 内 node_modules/@deepseek-ai/dsh-web-frontend/dist/assets/index-CN7NIWNf3.js 的
 * <code>function r4({state:e,size:t,...})</code>：{@code e==="ongoing"} 走 SVG，否则
 * {@code <span data-state={e} style={{width:n,height:n}}>}，n 默认 10）。同目录
 * index-BxpfOGf3.css 的规则（逐字）：
 *
 * <pre>
 * ._dot_1i3xo_2{position:relative;display:inline-block;flex:none}
 * ._dot_1i3xo_2:after{content:"";position:absolute;inset:20%;border-radius:50%;background:currentColor}
 * ._dot_1i3xo_2[data-state=done]{color:var(--dsw-alias-state-success-primary)}
 * ._dot_1i3xo_2[data-state=idle]{color:var(--dsw-alias-state-idle-primary)}
 * ._dot_1i3xo_2[data-state=error]{color:var(--dsw-alias-state-error-primary)}
 * </pre>
 *
 * <p>即：点不是「画一个 6px 的圆」，而是「10 单位盒子 + inset 20% 的伪元素」——
 * 直径 = 盒子 60%。这里保持同一条换算（{@link #BOX_DP}、{@link #INSET}），
 * 屏幕密度变化时点与环的比例才和主机一致。
 *
 * <p>颜色：主机取 state-success-primary = <b>#22C55E</b>（实测截图像素 34,197,94），
 * 本工程 {@code Theme.ok} 就是同一个值，浅色/深色相同，故不新造令牌；
 * 失败态用 {@code Theme.bad}（主机 error 槽位同角色）。
 */
public final class StateDot extends View {

    /** 主机 dot 的盒子边长（非 ongoing 时 size 默认 10px）。 */
    private static final float BOX_DP = 10f;
    /** 主机 `inset:20%` —— 四边各缩 20%，于是圆的直径是盒子的 60%。 */
    private static final float INSET = 0.2f;

    private final float boxPx;
    private final float radiusPx;
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);

    public StateDot(Context context, Theme theme, int color) {
        super(context);
        boxPx = theme.dp(BOX_DP);
        radiusPx = boxPx * (0.5f - INSET);
        paint.setStyle(Paint.Style.FILL);
        paint.setColor(color);
        // 主机这个 span 带 aria-hidden="true"：纯装饰，不朗读。
        setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
    }

    @Override
    protected void onMeasure(int widthSpec, int heightSpec) {
        // 与 StateRing 同理：宿主槽位给的是 EXACTLY（20dp），必须吃满，否则整列标题会跳。
        int want = Math.round(boxPx);
        setMeasuredDimension(resolve(widthSpec, want), resolve(heightSpec, want));
    }

    private static int resolve(int spec, int want) {
        int mode = MeasureSpec.getMode(spec);
        int size = MeasureSpec.getSize(spec);
        if (mode == MeasureSpec.EXACTLY) return size;
        if (mode == MeasureSpec.AT_MOST) return Math.min(size, want);
        return want;
    }

    @Override
    protected void onDraw(Canvas canvas) {
        // 点在槽里居中；直径只由 boxPx 决定，槽多大都不影响点的粗细。
        canvas.drawCircle(getWidth() / 2f, getHeight() / 2f, radiusPx, paint);
    }
}
