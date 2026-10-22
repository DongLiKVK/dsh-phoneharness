package com.lc.phoneharness;

import android.animation.ObjectAnimator;
import android.animation.TimeInterpolator;
import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.LinearGradient;
import android.graphics.Shader;
import android.graphics.drawable.PaintDrawable;
import android.provider.Settings;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewPropertyAnimator;
import android.view.animation.Interpolator;
import android.view.animation.LinearInterpolator;
import android.view.animation.PathInterpolator;

/**
 * 动效令牌层（词汇表）。
 *
 * 定位：**只放常量与无副作用工厂**。所有页面改版一律从这里取时长 / 曲线 / 幅度，
 * 不再在 Activity 里写 200、0.86f、t.dp(26) 这类裸值。
 *
 * 证据分三级，注释里逐条标注，docs/motion-tokens.md 有完整表：
 *   [测] 本项目现有行为实测：file:line，值原样搬进令牌，语义不变；
 *   [参考] 参考 APK 2.6.1 进包资源实测：official/... file:line；
 *   [库] 由参考 APK 的库版本推出的公开常量（androidx material3 1.4.0 MotionTokens /
 *        Compose 1.11.4 AnimationConstants）：**本机无外网，未联网复核**，
 *        见 SPEC_PENDING 列表，等 re-motion/lead 复核后回填。
 *
 * 纪律：
 *  - 全部 public static，无实例状态、无业务状态引用（不碰 Api/Sse/Harness/Hosts/Cache/Item/Prefs/Me）；
 *  - 不返回已 start 的东西可返回的动画器一律返回给调用方自己 start/cancel；
 *  - 数值不许在别处复制，改值只改这里。
 */
public final class Motion {

    private Motion() {
    }

    /* ================================================================ */
    /* 0. 规格待定清单                                                    */
    /* ================================================================ */

    /**
     * 仍在等外部取证的令牌名（值已给，但未经联网/台账复核）。
     * 复核口径：androidx material3 1.4.0 的 MotionTokens、Compose 1.11.4 的 AnimationConstants/Spring。
     * 本机外网不可用（web_fetch: fetch failed / curl: http=000），所以这一批只能标注、不能声称已核对。
     */
    public static final String[] SPEC_PENDING = {
            "DUR_SHORT1", "DUR_SHORT2", "DUR_SHORT3", "DUR_SHORT4",
            "DUR_MEDIUM1", "DUR_MEDIUM2", "DUR_MEDIUM3", "DUR_MEDIUM4",
            "DUR_LONG1", "DUR_LONG2", "DUR_LONG3", "DUR_LONG4",
            "DUR_EXTRALONG1", "DUR_EXTRALONG2", "DUR_EXTRALONG3", "DUR_EXTRALONG4",
            "DUR_COMPOSE_DEFAULT", "SPRING_MASS", "SPRING_STIFFNESS", "SPRING_DAMPING",
            "SHIMMER_MIN_ALPHA", "SHIMMER_MAX_ALPHA",
            "DUR_LOADING_LOOP", "DUR_TOGGLE", "DUR_PRESS",
    };

    /* ================================================================ */
    /* 1. 时长令牌（ms）                                                  */
    /* ================================================================ */

    /* ---- 1a. 页面转场 / 抽屉 / 弹层：本项目现有实测值 [测] ---- */

    /** 转场进（新页从右侧滑入并淡入）。[测] res/anim/nav_enter.xml:6 duration="200"。 */
    public static final int DUR_NAV_ENTER = 200;
    /** 转场出（旧页右移淡出）。[测] res/anim/nav_exit.xml:6 duration="170"。 */
    public static final int DUR_NAV_EXIT = 170;
    /** 返回时被露出的页（视差回位）。[测] res/anim/nav_pop_in.xml:6 duration="220"。 */
    public static final int DUR_NAV_POP_IN = 220;
    /** 返回时退场的页。[测] res/anim/nav_pop_out.xml:6 duration="220"。 */
    public static final int DUR_NAV_POP_OUT = 220;
    /** 抽屉打开。[测] MainActivity.java:2354 与 :2356 均 setDuration(220)。 */
    public static final int DUR_DRAWER_IN = 220;
    /** 抽屉关闭。[测] MainActivity.java:2379 与 :2380 均 setDuration(190)。 */
    public static final int DUR_DRAWER_OUT = 190;
    /** 弹层（底部面板）进入。[测] Seats.java:2157 与 :2158 均 setDuration(200)。 */
    public static final int DUR_SHEET_IN = 200;
    /** 弹层退出。[测] Seats.java:2167 与 :2174 均 setDuration(150)。 */
    public static final int DUR_SHEET_OUT = 150;
    /** 页内浮层淡入（搜索页）。[测] MainActivity.java:1732 setDuration(140)。 */
    public static final int DUR_OVERLAY_IN = 140;
    /** 遮罩淡入。[测] MainActivity.java:2356 setDuration(220)。 */
    public static final int DUR_SCRIM_IN = 220;
    /** 遮罩淡出。[测] MainActivity.java:2380 setDuration(190)。 */
    public static final int DUR_SCRIM_OUT = 190;

    /* ---- 1b. Material3 1.4.0 MotionTokens 时长阶梯（ms）[库] ---- */

    /** M3 duration scale short1。[库] material3 1.4.0 MotionTokens（未经本机复核）。 */
    public static final int DUR_SHORT1 = 50;
    /** [库] short2。 */
    public static final int DUR_SHORT2 = 100;
    /** [库] short3。 */
    public static final int DUR_SHORT3 = 150;
    /** [库] short4 —— 小型状态切换（chip/勾选）的常用档。 */
    public static final int DUR_SHORT4 = 200;
    /** [库] medium1。 */
    public static final int DUR_MEDIUM1 = 250;
    /** [库] medium2。 */
    public static final int DUR_MEDIUM2 = 300;
    /** [库] medium3。 */
    public static final int DUR_MEDIUM3 = 350;
    /** [库] medium4。 */
    public static final int DUR_MEDIUM4 = 400;
    /** [库] long1。 */
    public static final int DUR_LONG1 = 450;
    /** [库] long2。 */
    public static final int DUR_LONG2 = 500;
    /** [库] long3。 */
    public static final int DUR_LONG3 = 550;
    /** [库] long4。 */
    public static final int DUR_LONG4 = 600;
    /** [库] extralong1。 */
    public static final int DUR_EXTRALONG1 = 700;
    /** [库] extralong2。 */
    public static final int DUR_EXTRALONG2 = 800;
    /** [库] extralong3。 */
    public static final int DUR_EXTRALONG3 = 900;
    /** [库] extralong4。 */
    public static final int DUR_EXTRALONG4 = 1000;

    /**
     * Compose 动画默认时长。[库] Compose 1.11.4 AnimationConstants.DefaultDurationMillis = 300。
     * 语义：任何「没细挑档位」的 tween 默认就是这个值，是我们二次改版时的兜底档。
     */
    public static final int DUR_COMPOSE_DEFAULT = 300;

    /* ---- 1c. 交互反馈 / 循环类（[参考] = official/MOTION-SPEC.md 条目） ---- */

    /** 小控件 / 列表项点击涟漪快档。[参考] MOTION-SPEC §4.1 ← defpackage/z09.java:6 `tween(15ms, 0, l33-easing)`（使用方 yp3 / v4）。 */
    public static final int DUR_RIPPLE = 15;
    /** 微交互 in。[参考] MOTION-SPEC §4.3 ← defpackage/jw1.java:77 `tween(20ms,0,l33)`。 */
    public static final int DUR_MICRO_IN = 20;
    /** 微交互 out。[参考] MOTION-SPEC §4.3 ← defpackage/jw1.java:77 `tween(30ms,0,l33)`。 */
    public static final int DUR_MICRO_OUT = 30;
    /** 列表项反馈 enter。[参考] MOTION-SPEC §4.2 ← defpackage/v4.java:579 `tween(45ms,0,l33)`。 */
    public static final int DUR_LIST_FB_IN = 45;
    /** 列表项反馈 settle。[参考] MOTION-SPEC §4.2 ← defpackage/v4.java:586 `tween(150ms,0,l33)`。 */
    public static final int DUR_LIST_FB_OUT = 150;
    /**
     * 按压反馈（缩放下压再回弹）。
     * [待实测] MOTION-SPEC §4.4（A7 未采集）：110ms 只是动画技能给的经验区间中值，**不是参考证据**，
     * 规格回填后必须改这里，不要在调用方硬写时长。
     */
    public static final int DUR_PRESS = 110;
    /** 选中 / 开关 / chip 状态切换。[待实测] MOTION-SPEC §9.1 / §9.3（A11/A12 未采集）。 */
    public static final int DUR_TOGGLE = 150;
    /** 加载循环（旋转 / 脉冲）一圈。[待实测] MOTION-SPEC §5.2（A8 未采集）。 */
    public static final int DUR_LOADING_LOOP = 900;
    /**
     * 主机 harness（DSH Web GUI）「进行中」状态环的一圈：整组旋转与弧长呼吸共用这条时间轴。
     * [参考] 主机前端 dsh-web-frontend/dist/assets/index-BxpfOGf3.css（逐字）：
     *   ._spinnerMotion_1i3xo_42{transform-origin:center;animation:_dsh-state-dot-spin_1i3xo_1 1.5s linear infinite}
     *   ._spinnerArc_1i3xo_48{...;animation:_dsh-state-dot-dash_1i3xo_1 1.5s ease-in-out infinite}
     * 与 DUR_LOADING_LOOP（900，[待实测]）不是一回事：那是本项目猜的通用加载一圈，
     * 这是**主机实际在跑**的值，凡是「和主机同屏对拍」的地方以本令牌为准。
     */
    public static final int DUR_HOST_SPIN_LOOP = 1500;
    /** 骨架 shimmer 单程。[参考] MOTION-SPEC §5.1 ← defpackage/cb0.java:18-22 `tween(600ms, delay 200ms, cubic-bezier(0.42,0,0.58,1))`。 */
    public static final int DUR_SHIMMER = 600;
    /** 骨架 shimmer 起始延迟。[参考] MOTION-SPEC §5.1 ← defpackage/cb0.java:18-22 delay 200ms。 */
    public static final int DELAY_SHIMMER = 200;

    /* ---- 1d. 列表错峰 ---- */

    /** 错峰列表单条进场时长：用参考的列表项反馈 settle 档。[参考] MOTION-SPEC §4.2。 */
    public static final int DUR_LIST_ITEM_IN = DUR_LIST_FB_OUT;
    /** 兜底错峰步进（animate 技能 30–80ms 区间中值，非参考证据）。 */
    public static final int STAGGER_STEP = 40;
    /** 参考侧自己的错峰步长（三点打字动画的相位差）。[参考] MOTION-SPEC §5.2 ← defpackage/w2b.java:784-785 `infiniteRepeatable(..., StartOffset(-100ms/-200ms))`。 */
    public static final int STAGGER_DOT = 100;
    /** 错峰总上限，避免长列表尾部等太久。 */
    public static final int STAGGER_MAX = 240;

    /* ---- 1e. 参考 APK 自建转场令牌组（MOTION-SPEC §2.4 / §3.1 / §3.3 / §3.4 / §6.1-6.3） ---- */

    /** 全屏页 / 抽屉类「进」段时长。[参考] MOTION-SPEC §3.1 ← defpackage/mh7.java:20 `fadeIn(tween(195ms, delay 105ms, LinearOutSlowIn))`。 */
    public static final int DUR_PAGE_IN = 195;
    /** 全屏页「进」段延迟（195+105=300ms 成对）。[参考] MOTION-SPEC §3.1 ← defpackage/mh7.java:20 delay 105ms。 */
    public static final int DELAY_PAGE_IN = 105;
    /** 全屏页 / 抽屉类「出」段时长。[参考] MOTION-SPEC §3.1 ← defpackage/mh7.java:21 `fadeOut(tween(105ms, delay 0, FastOutLinearIn))`。 */
    public static final int DUR_PAGE_OUT = 105;
    /** 底部面板 / 弹层进入时长。[参考] MOTION-SPEC §6.1 ← defpackage/mh7.java:16 `TweenSpec(250ms, delay 200ms, cubic-bezier(0,0,0,1))`。 */
    public static final int DUR_PANEL_IN = 250;
    /** 底部面板进入延迟。[参考] MOTION-SPEC §6.1 ← defpackage/mh7.java:16 delay 200ms。 */
    public static final int DELAY_PANEL_IN = 200;
    /** 底部面板退出时长。[参考] MOTION-SPEC §6.2 ← defpackage/mh7.java:17 `TweenSpec(200ms, delay 0, cubic-bezier(0.3,0,1,1))`。 */
    public static final int DUR_PANEL_OUT = 200;
    /** 长/短面板另一组：默认面板进。[参考] MOTION-SPEC §6.3 ← defpackage/c44.java:9 `tween(120ms,0,FastOutSlowIn)`。 */
    public static final int DUR_PANEL_ALT_IN = 120;
    /** 长/短面板另一组：过渡段。[参考] MOTION-SPEC §6.3 ← defpackage/c44.java:11 `tween(150ms,0,cubic-bezier(0.4,0,0.6,1))`。 */
    public static final int DUR_PANEL_ALT_MID = 150;
    /** 中转场「进」段。[参考] MOTION-SPEC §3.4 ← defpackage/x62.java:57 `tween(150ms, delay 50ms, cubic-bezier(0.3,0,1,1))`。 */
    public static final int DUR_MID_IN = 150;
    /** 中转场「进」段延迟。[参考] MOTION-SPEC §3.4 ← defpackage/x62.java:57 delay 50ms。 */
    public static final int DELAY_MID_IN = 50;
    /** 滑入（长/短场景）。[参考] MOTION-SPEC §3.3 ← defpackage/w2b.java:808 `slideIn(tween(125ms, delay 50ms, LinearOutSlowIn))`。 */
    public static final int DUR_SLIDE_IN = 125;
    /** 滑入延迟。[参考] MOTION-SPEC §3.3 ← defpackage/w2b.java:808 delay 50ms。 */
    public static final int DELAY_SLIDE_IN = 50;
    /** 滑出 / settle。[参考] MOTION-SPEC §3.3 ← defpackage/w2b.java:808 `tween(150ms,0,LinearOutSlowIn)`。 */
    public static final int DUR_SLIDE_OUT = 150;

    /** 无障碍「移除动画」下，位移类动效的时长（0 = 直接落位）。 */
    public static final int DUR_REDUCED_MOTION = 0;
    /** 无障碍「移除动画」下，淡入淡出的保留时长（保留可读性，去掉位移）。 */
    public static final int DUR_REDUCED_FADE = 100;

    /* ================================================================ */
    /* 2. 缓动令牌                                                        */
    /* ================================================================ */

    /**
     * 标准曲线 cubic-bezier(0.4, 0.0, 0.2, 1.0)：没有明确进/出方向的过渡（屏上位移、变形）。
     * [参考] 两条独立证据同值：
     *   official/apktool-out/res/interpolator/fast_out_slow_in.xml:2（参考进包资源控制点）
     *   official/jadx-out/sources/defpackage/z24.java:8（参考自身字节码常量 a）
     */
    public static final TimeInterpolator EASE_STANDARD = cubicBezier(0.4f, 0f, 0.2f, 1f);

    /**
     * 减速曲线 cubic-bezier(0.0, 0.0, 0.2, 1.0)：**进场**默认。
     * [参考] official/jadx-out/sources/defpackage/z24.java:9
     *   public static final be3 b = new be3(0.0f, 0.0f, 0.2f, 1.0f);
     * （jadx 把两个 0.0f 渲染成混淆常量引用 l11l111lI1l.l111l1111lI1l，0.2f / 1.0f 为字面量。）
     * 与本项目 nav_enter.xml 原用的 @android:interpolator/decelerate_cubic 同方向。
     */
    public static final TimeInterpolator EASE_DECELERATE = cubicBezier(0f, 0f, 0.2f, 1f);

    /**
     * 加速曲线 cubic-bezier(0.4, 0.0, 1.0, 1.0)：**出场**默认。
     * [参考] official/jadx-out/sources/defpackage/z24.java:10
     *   public static final be3 c = new be3(0.4f, 0.0f, 1.0f, 1.0f);
     * 与本项目 nav_exit.xml 原用的 @android:interpolator/accelerate_cubic 同方向。
     */
    public static final TimeInterpolator EASE_ACCELERATE = cubicBezier(0.4f, 0f, 1f, 1f);

    /**
     * 强调减速曲线 cubic-bezier(0.0, 0.0, 0.0, 1.0)：参考的「进」侧 spec。
     * [参考] official/jadx-out/sources/defpackage/mh7.java:16（本机逐行复核）
     *   a = new zza(250, 200, new be3(0.0f, 0.0f, 0.0f, 1.0f));
     *   zza.java:10 `public zza(int i, int i2, x24 x24Var)` = (时长, 延迟, 缓动) → 250ms / 延迟 200ms。
     * 命名沿用 lead 口径；控制点以 mh7 字面值为准（本机已知的 M3 EmphasizedDecelerate 是 (0.05,0.7,0.1,1)，两者不同）。
     */
    public static final TimeInterpolator EASE_EMPH_DECEL = cubicBezier(0f, 0f, 0f, 1f);

    /**
     * 强调加速曲线 cubic-bezier(0.3, 0.0, 1.0, 1.0)：参考的「出」侧 spec。
     * [参考] official/jadx-out/sources/defpackage/mh7.java:15（本机逐行复核）
     *   be3 be3Var = new be3(0.3f, 0.0f, 1.0f, 1.0f);
     * [参考] official/jadx-out/sources/defpackage/mh7.java:17
     *   b = new zza(200, 0, be3Var);   // 时长 200ms / 延迟 0
     * （0.3f / 1.0f 为字面量；两个 0.0f 同 z24 一样被 jadx 渲染成 l11l111lI1l.l111l1111lI1l。）
     */
    public static final TimeInterpolator EASE_EMPH_ACCEL = cubicBezier(0.3f, 0f, 1f, 1f);

    /**
     * 线性：进度、装卸载、旋转。
     * [未证实] official/jadx-out/sources/defpackage/z24.java:11
     *   public static final l33 d = new l33();
     * 证据纠正：l33 经逐行核对是 **R8 合成类**（字节码签名 `public final synthetic class l33 implements x24`，
     * 带 `public final synthetic int a = 19;` 与一批 bridge 方法），不是 Compose 的 LinearEasing 对象。
     * 因此只能断言「槽位 d 需要一条线性曲线」，不能断言它是 LinearEasing —— 按线性实现，语义待复核。
     */
    public static final TimeInterpolator LINEAR = new LinearInterpolator();

    /**
     * 骨架 shimmer 扫光曲线。[参考] MOTION-SPEC §5.1 / §2.4 cb0 组
     * [参考] official/jadx-out/sources/defpackage/cb0.java:18-22
     *   a = new be3(0.42f, 0.0f, 0.58f, 1.0f);   // 对称型扫光曲线
     *   b = new zza(600, 200, a);                // 单程 600ms / 起始延迟 200ms（见 DUR_SHIMMER / DELAY_SHIMMER）
     */
    public static final TimeInterpolator EASE_SHIMMER = cubicBezier(0.42f, 0f, 0.58f, 1f);

    /**
     * 长/短面板另一组的过渡曲线。[参考] MOTION-SPEC §6.3 / §2.4 c44 组
     * [参考] official/jadx-out/sources/defpackage/c44.java:9-13
     *   b = new zza(150, 0, new be3(0.4f, 0.0f, 0.6f, 1.0f));   // 过渡段 150ms
     */
    public static final TimeInterpolator EASE_PANEL_ALT = cubicBezier(0.4f, 0f, 0.6f, 1f);

    /* ================================================================ */
    /* 3. 弹簧（物理插值，不是贝塞尔拟合）                                 */
    /* ================================================================ */

    /** 弹簧质量。[库] Compose Spring 默认 mass = 1。 */
    public static final float SPRING_MASS = 1f;

    /*
     * ---- 参考 APK 真实使用的弹簧（[参考] MOTION-SPEC §2.3 / §2.4）----
     * 与下面的 legacy 三件套并存；新接线优先用这一组。
     */

    /** 单弹簧：阻尼比。[参考] official/jadx-out/sources/defpackage/um9.java:10 `new yg4(0.6f, 400.0f)`（yg4 = SpringSpec(dampingRatio, stiffness, visibilityThreshold)，见 MOTION-SPEC §2.1 符号表）。 */
    public static final float SPRING_RATIO_SOFT = 0.6f;
    /** 单弹簧：刚度。[参考] 同上 um9.java:10。 */
    public static final float SPRING_STIFFNESS_SOFT = 400f;

    /** 弹簧组三档之一：低阻尼 + 高刚度（跟手，允许轻微过冲）。[参考] official/jadx-out/sources/defpackage/um9.java:11 `k53.U0(0.2f, 1000.0f, null, 4)`。 */
    public static final float SPRING_RATIO_A = 0.2f;
    /** 见 SPRING_RATIO_A。 */
    public static final float SPRING_STIFFNESS_A = 1000f;
    /** 弹簧组三档之二：临界阻尼 + 低刚度（稳、慢）。[参考] um9.java:11 `k53.U0(1.0f, 130.0f, null, 4)`。 */
    public static final float SPRING_RATIO_B = 1.0f;
    /** 见 SPRING_RATIO_B。 */
    public static final float SPRING_STIFFNESS_B = 130f;
    /** 弹簧组三档之三：中等匀滑（默认手感）。[参考] um9.java:11 `k53.U0(0.8f, 300.0f, null, 4)`。 */
    public static final float SPRING_RATIO_C = 0.8f;
    /** 见 SPRING_RATIO_C。 */
    public static final float SPRING_STIFFNESS_C = 300f;

    /** 高刚度单弹簧（f1b 组）：阻尼比 0（无回弹）。[参考] official/jadx-out/sources/defpackage/f1b.java:1004 `spring(0, 700, null)`。 */
    public static final float SPRING_RATIO_700 = 0f;
    /** 见 SPRING_RATIO_700。 */
    public static final float SPRING_STIFFNESS_700 = 700f;

    /*
     * ---- legacy（motion-core 首轮自拟，**非参考证据**）----
     * 保留是为了不破坏已按此口径调过参的调用方；新接线请优先用上面 um9 的参考值。
     */

    /** [库] 刚度（legacy，非参考证据）。 */
    public static final float SPRING_STIFFNESS = 300f;
    /** [库] 阻尼，由 bounce = 0.19 反推（zeta = 1 - bounce，Compose Spring 口径）。 */
    public static final float SPRING_DAMPING = 28f;
    /** 弹簧动效时长 = 到 0.1% 残差的整定时间；按 legacy（300/28）解析式算出 493ms，取整 500。 */
    public static final int DUR_SPRING = 500;

    /**
     * 弹簧插值器（解析解，零速度起步）。
     *
     * 为什么不做贝塞尔拟合：本机实测过一轮最小二乘拟合（统一到同一时长口径），
     * 单段三次贝塞尔最多只能把最大误差压到行程的 ~14.7%（26dp 行程 = 3.8dp），
     * 起手段的快速上升 + 1.34% 过冲这一对形状一个三次曲线表达不了 —— 所以改用解析式。
     * 解析式在 t = 时长 处的残差 = e^(-zeta*w0*T)，本机算得 8.1e-4（0.08%）。
     *
     * @param mass      质量（>0）
     * @param stiffness 刚度（>0）
     * @param damping   阻尼（>=0）；damping = 2*sqrt(mass*stiffness) 为临界阻尼（无过冲）
     */
    public static TimeInterpolator spring(final float mass, final float stiffness, final float damping) {
        return new TimeInterpolator() {
            @Override
            public float getInterpolation(float input) {
                return springValue(mass, stiffness, damping, input);
            }
        };
    }

    /** 单个时刻的弹簧位移（0..1 目标区间，可微过冲）。t 为归一化时间，1 = 整定时刻。 */
    public static float springValue(float mass, float stiffness, float damping, float t) {
        if (mass <= 0f || stiffness <= 0f) return t;
        float w0 = (float) Math.sqrt(stiffness / mass);
        float zeta = damping / (float) (2.0 * Math.sqrt(stiffness * mass));
        if (zeta <= 0f) return t;
        float x = 1f;
        if (zeta < 1f) {
            float wd = w0 * (float) Math.sqrt(1f - zeta * zeta);
            x = 1f - (float) (Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + (zeta * w0 / wd) * Math.sin(wd * t)));
        } else {
            float wd = w0 * (float) Math.sqrt(zeta * zeta - 1f);
            x = 1f - (float) (Math.exp(-zeta * w0 * t) * (Math.cosh(wd * t) + (zeta * w0 / wd) * Math.sinh(wd * t)));
        }
        return x;
    }

    /**
     * 该弹簧到 0.1% 残差需要的整定时间（ms），即「弹簧动效该填多长」。
     * 纯计算，不改状态；解析式： T = ln(1000) / (zeta * w0)。
     */
    public static int springSettleMs(float mass, float stiffness, float damping) {
        if (mass <= 0f || stiffness <= 0f || damping <= 0f) return DUR_SPRING;
        float w0 = (float) Math.sqrt(stiffness / mass);
        float zeta = damping / (float) (2.0 * Math.sqrt(stiffness * mass));
        if (zeta <= 0f) return DUR_SPRING;
        return Math.round((float) (Math.log(1000.0) / (zeta * w0)) * 1000f);
    }

    /* ================================================================ */
    /* 4. 位移 / 缩放 / 透明度幅度令牌                                     */
    /* ================================================================ */

    /** 转场滑入幅度（页面宽度的比例）。[测] res/anim/nav_enter.xml:8 fromXDelta="9%p"。 */
    public static final float NAV_SLIDE_IN = 0.09f;
    /** 转场时被盖住那一页的反向位移。[测] res/anim/nav_push_out.xml:8 toXDelta="-8%p"。 */
    public static final float NAV_SLIDE_BACK = 0.08f;
    /** 弹层进入的起始下移。[测] Seats.java:2153 t.dp(26)。 */
    public static final float SHEET_OFFSET_DP = 26f;
    /** 弹层退出的下移。[测] Seats.java:2167 t.dp(30)。 */
    public static final float SHEET_EXIT_OFFSET_DP = 30f;
    /** 首页 hero 进场位移。[测] MainActivity.java:374 setTranslationY(-t.dp(22))。 */
    public static final float HERO_OFFSET_DP = 22f;
    /** 转场淡入的起始透明度。[测] res/anim/nav_enter.xml:4 fromAlpha="0.86"。 */
    public static final float ENTER_ALPHA = 0.86f;
    /** 视差露出的那一页的起始透明度。[测] res/anim/nav_pop_in.xml:4 fromAlpha="0.9"。 */
    public static final float ENTER_ALPHA_SOFT = 0.90f;
    /** 抽屉遮罩的最大不透明度。[测] MainActivity.java:2356 alpha(0.6f)。 */
    public static final float SCRIM_ALPHA = 0.60f;
    /** 禁用态透明度。[测] MainActivity.java:766、ChatActivity.java:2947 setAlpha(0.45f)。 */
    public static final float DISABLED_ALPHA = 0.45f;
    /** 次级/被压暗元素的透明度。[测] Seats.java:2327 setAlpha(0.55f)。 */
    public static final float DIM_ALPHA = 0.55f;
    /** 按压缩放。依据：animate 技能「Never Ship」表 —— 入场不得用 scale(0)，下压取 0.9–0.97 区间。 */
    public static final float PRESS_SCALE = 0.97f;
    /**
     * 居中弹层（Dialog）进场起始缩放 —— **[待实测·归属未定]**，不得当作已对齐参考的值。
     *
     * 现状：0.96 只满足「不违反技能硬规则（入场禁 scale(0)，起手取 0.9–0.97 区间）」，
     * 参考侧**没有**任何一条已确认为 Dialog 进场的缩放幅度证据（MOTION-SPEC §10 的 A1–A12 全未采集）。
     * 结构上最相近的候选是 EMPH 对（mh7.java:15-17：a = 250ms + 延迟 200 + cubic(0,0,0,1)、
     * b = 200ms + 延迟 0 + cubic(0.3,0,1,1)），但它被哪个 UI 消费尚未确认（re-motion 复核中）。
     * 归属确认后再改值。
     */
    public static final float PANEL_SCALE_IN = 0.96f;
    /** 骨架底色的不透明度下限。TODO(spec)：等 A8 采集。 */
    public static final float SHIMMER_MIN_ALPHA = 0.55f;
    /** 骨架底色的不透明度上限。 */
    public static final float SHIMMER_MAX_ALPHA = 1.00f;

    /* ================================================================ */
    /* 5. 工厂                                                           */
    /* ================================================================ */

    /**
     * 三次贝塞尔缓动，与 Compose CubicBezierEasing 同一解析式：
     * x(u) = 3(1-u)^2*u*x1 + 3(1-u)*u^2*x2 + u^3（y 同构），给定 x 用牛顿迭代反解 u。
     * 控制点的 x 必须在 [0,1]（否则不是函数），y 允许 >1（过冲）。
     */
    public static TimeInterpolator cubicBezier(final float x1, final float y1, final float x2, final float y2) {
        return new TimeInterpolator() {
            @Override
            public float getInterpolation(float input) {
                return bezierY(solveU(input, x1, x2), x1, y1, x2, y2);
            }
        };
    }

    /** 平台 PathInterpolator 版本（API 21+），控制点与 cubicBezier 相同，用于交给 XML/系统动画的场景。 */
    public static Interpolator pathBezier(float x1, float y1, float x2, float y2) {
        return new PathInterpolator(x1, y1, x2, y2);
    }

    private static float solveU(float x, float x1, float x2) {
        if (x <= 0f) return 0f;
        if (x >= 1f) return 1f;
        float u = x;
        for (int i = 0; i < 8; i++) {
            float f = bezierX(u, x1, x2) - x;
            if (f < 0.000001f && f > -0.000001f) break;
            float d = 3f * (1f - u) * (1f - u) * x1 + 6f * (1f - u) * u * (x2 - x1) + 3f * u * u * (1f - x2);
            if (d < 0.000001f) break;
            u -= f / d;
            if (u < 0f) u = 0f;
            else if (u > 1f) u = 1f;
        }
        return u;
    }

    /** x(u) = 3(1-u)^2*u*x1 + 3(1-u)*u^2*x2 + u^3 —— 与 Compose CubicBezierEasing 完全同式。 */
    private static float bezierX(float u, float x1, float x2) {
        float v = 1f - u;
        return 3f * v * v * u * x1 + 3f * v * u * u * x2 + u * u * u;
    }

    private static float bezierY(float u, float x1, float y1, float x2, float y2) {
        float v = 1f - u;
        return 3f * v * v * u * y1 + 3f * v * u * u * y2 + u * u * u;
    }

    /* ================================================================ */
    /* 6. 无障碍门：减少动效                                                */
    /* ================================================================ */

    /**
     * 系统动画时长缩放归 0 时视为「减少动效」（Compose 的 MotionDurationScale 也读这个值）。
     * 交付纪律：减少动效 = 更少更轻，不是零 —— 位移/缩放归零直接落位，淡入淡出保留 DUR_REDUCED_FADE。
     */
    public static boolean reducedMotion(Context context) {
        if (context == null) return false;
        try {
            return Settings.Global.getFloat(context.getContentResolver(),
                    Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f;
        } catch (Throwable ignored) {
            return false;
        }
    }

    /** 位移/缩放类动效时长：减少动效时归 0（直接落位）。 */
    public static int durMotion(Context context, int durationMs) {
        return reducedMotion(context) ? DUR_REDUCED_MOTION : durationMs;
    }

    /** 透明度/颜色类动效时长：减少动效时压到 DUR_REDUCED_FADE，不归零。 */
    public static int durFade(Context context, int durationMs) {
        if (!reducedMotion(context)) return durationMs;
        return durationMs < DUR_REDUCED_FADE ? durationMs : DUR_REDUCED_FADE;
    }

    /* ================================================================ */
    /* 7. View 进出场（通用工厂）                                           */
    /* ================================================================ */

    /**
     * 通用进场：先把视图摆到 (dxPx, dyPx) 偏移与 fromAlpha，再落到原位 1.0。
     * 返回**未启动**的动画器，调用方自己 start()；退出请用对称的 exit()（按进来的路径退）。
     */
    public static ViewPropertyAnimator enter(View v, float dxPx, float dyPx, float fromAlpha,
                                            int durationMs, TimeInterpolator interpolator) {
        v.setTranslationX(dxPx);
        v.setTranslationY(dyPx);
        v.setAlpha(fromAlpha);
        return v.animate()
                .translationX(0f)
                .translationY(0f)
                .alpha(1f)
                .setDuration(durationMs)
                .setInterpolator(interpolator);
    }

    /** 通用退场：沿 (dxPx, dyPx) 走、淡到 toAlpha。endAction 可空。 */
    public static ViewPropertyAnimator exit(View v, float dxPx, float dyPx, float toAlpha,
                                           int durationMs, TimeInterpolator interpolator, Runnable endAction) {
        ViewPropertyAnimator a = v.animate()
                .translationX(dxPx)
                .translationY(dyPx)
                .alpha(toAlpha)
                .setDuration(durationMs)
                .setInterpolator(interpolator);
        if (endAction != null) a.withEndAction(endAction);
        return a;
    }

    /** 淡入（进场曲线）。 */
    public static ViewPropertyAnimator fadeIn(View v, int durationMs) {
        return v.animate().alpha(1f).setDuration(durationMs).setInterpolator(EASE_DECELERATE);
    }

    /** 淡出（仍用 ease-out：UI 里不用 ease-in，见 animate 技能 Never Ship 表）。 */
    public static ViewPropertyAnimator fadeOut(View v, int durationMs, Runnable endAction) {
        ViewPropertyAnimator a = v.animate().alpha(0f).setDuration(durationMs).setInterpolator(EASE_ACCELERATE);
        if (endAction != null) a.withEndAction(endAction);
        return a;
    }

    /** 横向滑移：从 fromXpx 到 toXpx（不带淡入淡出）。 */
    public static ViewPropertyAnimator slideX(View v, float fromXpx, float toXpx,
                                             int durationMs, TimeInterpolator interpolator) {
        v.setTranslationX(fromXpx);
        return v.animate().translationX(toXpx).setDuration(durationMs).setInterpolator(interpolator);
    }

    /** 页面进场的位移量 = 页面宽度的 NAV_SLIDE_IN。宽度未布局时退回屏幕宽度。 */
    public static float pageShift(View v) {
        int width = v.getWidth();
        if (width <= 0) width = v.getResources().getDisplayMetrics().widthPixels;
        return width * NAV_SLIDE_IN;
    }

    /** 页面进场：与 res/anim/nav_enter.xml 同参数（右移 9% 屏宽 + 0.86 起淡入，200ms，强减速）。 */
    public static ViewPropertyAnimator pageEnter(View v, Context context) {
        return enter(v, pageShift(v), 0f, ENTER_ALPHA, durMotion(context, DUR_NAV_ENTER), EASE_DECELERATE);
    }

    /** 页面退场：与 res/anim/nav_exit.xml 同参数（右移 9% 屏宽、淡到 0.86，170ms）。 */
    public static ViewPropertyAnimator pageExit(View v, Context context, Runnable endAction) {
        return exit(v, pageShift(v), 0f, ENTER_ALPHA, durMotion(context, DUR_NAV_EXIT), EASE_ACCELERATE, endAction);
    }

    /** 返回时被露出的页：与 nav_pop_in.xml 同参数（-8% 屏宽回位 + 0.9 起淡入，220ms）。 */
    public static ViewPropertyAnimator pageReveal(View v, Context context) {
        return enter(v, -pageShift(v) * (NAV_SLIDE_BACK / NAV_SLIDE_IN), 0f, ENTER_ALPHA_SOFT,
                durMotion(context, DUR_NAV_POP_IN), EASE_DECELERATE);
    }

    /* ================================================================ */
    /* 8. 弹层 / 抽屉 / 遮罩                                                */
    /* ================================================================ */

    /**
     * 弹层进场：卡片自下 SHEET_OFFSET_DP 上浮淡入，遮罩同帧升到 SCRIM_ALPHA。
     * [测] Seats.java:2153-2158（位移 26dp / 200ms / scrim 200ms）；曲线用参考的 EASE_DECELERATE（进场）。
     */
    public static ViewPropertyAnimator sheetIn(View card, View scrim, Theme theme) {
        card.setTranslationY(theme.dp(SHEET_OFFSET_DP));
        card.setAlpha(0f);
        if (scrim != null) {
            scrim.animate().alpha(SCRIM_ALPHA).setDuration(DUR_SHEET_IN).setInterpolator(EASE_DECELERATE);
        }
        return card.animate()
                .translationY(0f)
                .alpha(1f)
                .setDuration(DUR_SHEET_IN)
                .setInterpolator(EASE_DECELERATE);
    }

    /**
     * 弹层退出（保持现有实测行程 30dp）。
     * [测] Seats.java:2167-2174（30dp / 150ms）。
     * 注意：进场 26dp、退出 30dp 是当前实现的非对称值，规格侧待定，见 sheetOutSymmetric。
     */
    public static ViewPropertyAnimator sheetOut(View card, View scrim, Theme theme, Runnable endAction) {
        if (scrim != null) {
            scrim.animate().alpha(0f).setDuration(DUR_SHEET_OUT).setInterpolator(EASE_ACCELERATE);
        }
        ViewPropertyAnimator a = card.animate()
                .translationY(theme.dp(SHEET_EXIT_OFFSET_DP))
                .alpha(0f)
                .setDuration(DUR_SHEET_OUT)
                .setInterpolator(EASE_ACCELERATE);
        if (endAction != null) a.withEndAction(endAction);
        return a;
    }

    /** 弹层退出的对称版本：按进来的路径原样退（animate 技能硬规则「退出按进来路径退」）。待规格裁决用哪个。 */
    public static ViewPropertyAnimator sheetOutSymmetric(View card, View scrim, Theme theme, Runnable endAction) {
        if (scrim != null) {
            scrim.animate().alpha(0f).setDuration(DUR_SHEET_OUT).setInterpolator(EASE_ACCELERATE);
        }
        ViewPropertyAnimator a = card.animate()
                .translationY(theme.dp(SHEET_OFFSET_DP))
                .alpha(0f)
                .setDuration(DUR_SHEET_OUT)
                .setInterpolator(EASE_ACCELERATE);
        if (endAction != null) a.withEndAction(endAction);
        return a;
    }

    /**
     * 居中弹层（系统 Dialog 的 card）进场：scale PANEL_SCALE_IN→1 + alpha ENTER_ALPHA_SOFT→1。
     *
     * **[待实测·归属未定] 时长与幅度都还没有参考证据 —— 这是诚实占位，不是对齐：**
     * · 缩放 0.96：见 PANEL_SCALE_IN（技能硬规则的下限，不是参考实测）。
     * · 时长 120ms：借用 c44.java:9-11 的最短档（120/150/120，参考侧的短过渡，不是 Dialog）。
     * · 结构上最相近的是 EMPH 对 mh7.java:15-17（a = 250ms + 延迟 200、b = 200ms + 延迟 0），
     *   即「先等一段、再快进/快退」的节奏；它的真实消费方未确认（re-motion 复核中）。
     *   **归属确认前，不得把这里的数值写成「已对齐 EMPH」。**
     * 唯一有证据的是曲线：进场侧 EASE_DECELERATE（z24.java:9）。
     * 减少动效打开时：去掉缩放，只留 durFade(...) ≤ DUR_REDUCED_FADE 的淡入。
     *
     * 用法：dialog.show(); 之后立刻调用（此刻 card 已完成测量）；不改业务分支与调用顺序。
     */
    public static ViewPropertyAnimator panelIn(View card, Context context) {
        boolean reduced = reducedMotion(context);
        float from = reduced ? 1f : PANEL_SCALE_IN;
        card.setScaleX(from);
        card.setScaleY(from);
        card.setAlpha(reduced ? 1f : ENTER_ALPHA_SOFT);
        return card.animate()
                .scaleX(1f)
                .scaleY(1f)
                .alpha(1f)
                .setDuration(durFade(context, DUR_PANEL_ALT_IN))
                .setInterpolator(EASE_DECELERATE);
    }

    /**
     * 弹层退场（对称：按进来的路径退到 PANEL_SCALE_IN + alpha 0）。
     * 幅度/时长与 panelIn 同一口径，同样是 **[待实测·归属未定]**（EMPH 对归属未确认）。
     * 注意：当前**未接线** —— 系统 Dialog 的退场要靠 dialog.dismiss()，而 dismiss 的调用点在业务分支里，
     * 令牌层不能改调用顺序。screen 同学若要接入，请先问 lead。
     */
    public static ViewPropertyAnimator panelOut(View card, Context context, Runnable endAction) {
        ViewPropertyAnimator a = card.animate()
                .scaleX(PANEL_SCALE_IN)
                .scaleY(PANEL_SCALE_IN)
                .alpha(0f)
                .setDuration(durFade(context, DUR_PANEL_ALT_IN))
                .setInterpolator(EASE_ACCELERATE);
        if (endAction != null) a.withEndAction(endAction);
        return a;
    }

    /**
     * 抽屉进场：抽屉从 fromXpx 归位（通常 fromXpx = -抽屉宽度），遮罩升到 SCRIM_ALPHA。
     * [测] MainActivity.java:2354-2356（220ms，原用 DecelerateInterpolator）；曲线统一为进场 EASE_DECELERATE / 退场 EASE_ACCELERATE。
     */
    public static ViewPropertyAnimator drawerIn(View drawer, View scrim, float fromXpx) {
        if (scrim != null) {
            scrim.animate().alpha(SCRIM_ALPHA).setDuration(DUR_DRAWER_IN).setInterpolator(EASE_DECELERATE);
        }
        return slideX(drawer, fromXpx, 0f, DUR_DRAWER_IN, EASE_DECELERATE);
    }

    /** 抽屉退场：抽屉移到 toXpx（-抽屉宽度），遮罩归 0。[测] MainActivity.java:2379-2381（190ms）。 */
    public static ViewPropertyAnimator drawerOut(View drawer, View scrim, float toXpx, Runnable endAction) {
        if (scrim != null) {
            scrim.animate().alpha(0f).setDuration(DUR_DRAWER_OUT).setInterpolator(EASE_ACCELERATE);
        }
        ViewPropertyAnimator a = drawer.animate()
                .translationX(toXpx)
                .setDuration(DUR_DRAWER_OUT)
                .setInterpolator(EASE_ACCELERATE);
        if (endAction != null) a.withEndAction(endAction);
        return a;
    }

    /** 遮罩进场：升到 SCRIM_ALPHA。 */
    public static ViewPropertyAnimator scrimIn(View scrim, int durationMs) {
        return scrim.animate().alpha(SCRIM_ALPHA).setDuration(durationMs).setInterpolator(EASE_DECELERATE);
    }

    /** 遮罩退场：归 0，可带收尾动作。 */
    public static ViewPropertyAnimator scrimOut(View scrim, int durationMs, Runnable endAction) {
        ViewPropertyAnimator a = scrim.animate().alpha(0f).setDuration(durationMs).setInterpolator(EASE_ACCELERATE);
        if (endAction != null) a.withEndAction(endAction);
        return a;
    }

    /* ================================================================ */
    /* 9. 按压反馈（含涟漪）                                                */
    /* ================================================================ */

    /**
     * 按压反馈：按下缩到 PRESS_SCALE、抬起回 1，时长 DUR_PRESS。
     * 监听器返回 false，**不吞事件** —— 原有 onClick / onLongClick 与系统涟漪照常工作。
     */
    public static void press(final View v) {
        if (v == null) return;
        v.setOnTouchListener(new View.OnTouchListener() {
            @Override
            public boolean onTouch(View view, MotionEvent event) {
                if (!view.isEnabled()) return false;
                switch (event.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN:
                        scaleTo(view, PRESS_SCALE);
                        break;
                    case MotionEvent.ACTION_UP:
                    case MotionEvent.ACTION_CANCEL:
                        scaleTo(view, 1f);
                        break;
                    default:
                        break;
                }
                return false;
            }
        });
    }

    /** 按压反馈 + 涟漪背景。radiusDp 取 Theme 既有半径标度（如 999 = 全圆角胶囊）。 */
    public static void pressRipple(View v, Theme theme, float radiusDp) {
        if (v == null) return;
        v.setBackground(theme.ripple(radiusDp));
        press(v);
    }

    private static void scaleTo(View view, float scale) {
        view.animate()
                .scaleX(scale)
                .scaleY(scale)
                .setDuration(DUR_PRESS)
                .setInterpolator(EASE_DECELERATE);
    }

    /* ================================================================ */
    /* 10. 加载 / 骨架                                                      */
    /* ================================================================ */

    /** 无限旋转（加载指示）。返回**未启动**的动画器。 */
    public static ObjectAnimator loading(View v) {
        ObjectAnimator a = ObjectAnimator.ofFloat(v, View.ROTATION, 0f, 360f);
        a.setDuration(DUR_LOADING_LOOP);
        a.setRepeatCount(ValueAnimator.INFINITE);
        a.setInterpolator(LINEAR);
        return a;
    }

    /** 骨架 shimmer：透明度在 MIN..MAX 之间来回。返回**未启动**的动画器。 */
    public static ObjectAnimator shimmer(View v) {
        ObjectAnimator a = ObjectAnimator.ofFloat(v, View.ALPHA, SHIMMER_MIN_ALPHA, SHIMMER_MAX_ALPHA);
        a.setDuration(DUR_SHIMMER);
        a.setRepeatCount(ValueAnimator.INFINITE);
        a.setRepeatMode(ValueAnimator.REVERSE);
        a.setInterpolator(LINEAR);
        return a;
    }

    /**
     * 骨架色带（静态，无动画）：base 底 + highlight 高光条，条宽 bandPx 水平平铺。
     * 说明：带位移动的扫光需要给 shader 加动态 matrix，属规格待定项（SPEC_PENDING），先只给静态色带。
     */
    public static PaintDrawable shimmerBand(final float bandPx, final int baseColor, final int highlightColor) {
        final float w = bandPx > 0f ? bandPx : 120f;
        PaintDrawable d = new PaintDrawable(baseColor);
        d.setShaderFactory(new PaintDrawable.ShaderFactory() {
            @Override
            public Shader resize(int width, int height) {
                return new LinearGradient(0f, 0f, w, 0f,
                        new int[]{baseColor, highlightColor, baseColor},
                        new float[]{0f, 0.5f, 1f},
                        Shader.TileMode.REPEAT);
            }
        });
        return d;
    }

    /* ================================================================ */
    /* 11. 列表错峰 / 中断                                                 */
    /* ================================================================ */

    /** 第 index 项的起始延迟（默认步进），带上限。 */
    public static long staggerDelay(int index) {
        return staggerDelay(index, STAGGER_STEP);
    }

    /** 第 index 项的起始延迟，自定义步进，封顶 STAGGER_MAX。 */
    public static long staggerDelay(int index, int stepMs) {
        if (index <= 0 || stepMs <= 0) return 0L;
        long d = (long) index * (long) stepMs;
        return d > STAGGER_MAX ? STAGGER_MAX : d;
    }

    /**
     * 列表项错峰进场：0 起淡入 + dyPx 上浮归位，延迟 = staggerDelay(index)。
     * 减少动效时位移归零、时长压到 <= DUR_REDUCED_FADE（只留淡入淡出，见 animate 技能的无障碍门）。
     */
    public static ViewPropertyAnimator staggerIn(View v, int index, float dyPx) {
        Context context = v == null ? null : v.getContext();
        float dy = context == null ? dyPx : (reducedMotion(context) ? 0f : dyPx);
        int duration = context == null ? DUR_LIST_ITEM_IN : durFade(context, DUR_LIST_ITEM_IN);
        return enter(v, 0f, dy, 0f, duration, EASE_DECELERATE).setStartDelay(staggerDelay(index));
    }

    /** 中断：立刻停掉这些视图上正在跑的动画（重新触发前先调，避免叠着跑）。 */
    public static void cancel(View... views) {
        if (views == null) return;
        for (View v : views) {
            if (v != null) v.animate().cancel();
        }
    }

    /** 中断：停掉这些 Animator（shimmer / loading 这类循环动画用完必须停）。 */
    public static void stop(android.animation.Animator... animators) {
        if (animators == null) return;
        for (android.animation.Animator a : animators) {
            if (a != null) a.cancel();
        }
    }
}
