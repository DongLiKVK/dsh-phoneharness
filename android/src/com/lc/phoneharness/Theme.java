package com.lc.phoneharness;

import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.util.DisplayMetrics;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * 界面用的颜色与基础控件工厂。
 *
 * 取色直接照抄 DeepSeek 官方客户端 2.6.1（com.deepseek.chat）的设计令牌：
 * 浅色 #FFFFFF 底 + 近黑 #0F0F0F 文字 + 主色 #426EFE；
 * 深色 #0F0F0F 底 + #F8F8F8 文字 + 主色 #507BF2。
 * 次级文字 #7D7F85 / 图标灰 #8E9094 / 描边 #D4D4D4（官方 values/colors.xml 与图标 fill 统计所得）。
 * 所有界面代码都从这里取色，不写死颜色。
 */
public final class Theme {

    /** 品牌色：站点 theme-color #1775c8。 */
    public static final int BRAND = 0xFF1775C8;

    /* ================================================================= */
    /* 视觉令牌（本轮新增，只加不改）                                        */
    /* 依据：本项目现有取值分布实测；每个常量后面的注释给出 file:line 或次数。 */
    /* 用途：页面改版时从这里取档位，不再各写各的 12f / 13f / 15f。          */
    /* 动效侧令牌见 Motion.java；本文档的令牌表见 docs/motion-tokens.md。    */
    /* ================================================================= */

    /* ---- 字号层级（sp）---- */
    /** 22sp 档。[测] PairActivity.java:61。 */
    public static final float TYPE_XL = 22f;
    /** 19sp 档。[测] SettingsActivity.java:1299。 */
    public static final float TYPE_L = 19f;
    /** 17sp 档，出现 5 次。 */
    public static final float TYPE_M = 17f;
    /** 16sp 档，出现 19 次。 */
    public static final float TYPE_S = 16f;
    /** 15sp 档，出现 20 次。 */
    public static final float TYPE_BODY = 15f;
    /** 14sp 档，出现 19 次；同时是 fontScale 生效门槛（Theme.java:197）。 */
    public static final float TYPE_BODY_S = 14f;
    /** 13sp 档，出现 26 次。 */
    public static final float TYPE_LABEL = 13f;
    /** 12sp 档，出现 39 次（全库最高频字号）。 */
    public static final float TYPE_LABEL_S = 12f;
    /** 11sp 档，出现 15 次。 */
    public static final float TYPE_CAPTION = 11f;
    /** 10sp 档，出现 2 次。 */
    public static final float TYPE_MICRO = 10f;
    /** 9sp 档，出现 1 次。 */
    public static final float TYPE_TINY = 9f;

    /* ---- 圆角（dp）：来自 round()/roundStroke() 的实测半径分布 ---- */
    /** 直角。[测] MainActivity.java:1532。 */
    public static final float RADIUS_NONE = 0f;
    /** 2dp。[测] Seats.java:2214。 */
    public static final float RADIUS_XS = 2f;
    /** 6dp 档。 */
    public static final float RADIUS_S = 6f;
    /** 8dp 档。 */
    public static final float RADIUS_M = 8f;
    /** 10dp 档。 */
    public static final float RADIUS_L = 10f;
    /** 12dp 档。 */
    public static final float RADIUS_XL = 12f;
    /** 14dp 档。 */
    public static final float RADIUS_2XL = 14f;
    /** 16dp 档。 */
    public static final float RADIUS_3XL = 16f;
    /** 18dp 档。 */
    public static final float RADIUS_4XL = 18f;
    /** 20dp 档。 */
    public static final float RADIUS_5XL = 20f;
    /** 22dp 档。 */
    public static final float RADIUS_6XL = 22f;
    /** 24dp 档。 */
    public static final float RADIUS_7XL = 24f;
    /** 26dp 档。[测] NewSessionActivity.java:155。 */
    public static final float RADIUS_8XL = 26f;
    /** 28dp 档。[测] ChatActivity.java:413（card roundStroke 28f）。 */
    public static final float RADIUS_9XL = 28f;
    /** 胶囊 / 全圆（现有写法统一用 999）。 */
    public static final float RADIUS_FULL = 999f;

    /* ---- 间距（dp）：来自 dp() 调用实测高频值，括号内为出现次数 ---- */
    /** 2dp（33 次）。 */
    public static final float SPACE_2 = 2f;
    /** 4dp（46 次）。 */
    public static final float SPACE_4 = 4f;
    /** 6dp（89 次，全库最高频间距）。 */
    public static final float SPACE_6 = 6f;
    /** 8dp（82 次）。 */
    public static final float SPACE_8 = 8f;
    /** 10dp（75 次）。 */
    public static final float SPACE_10 = 10f;
    /** 12dp（68 次）。 */
    public static final float SPACE_12 = 12f;
    /** 14dp（76 次）。 */
    public static final float SPACE_14 = 14f;
    /** 16dp（76 次）。 */
    public static final float SPACE_16 = 16f;
    /** 18dp（35 次）。 */
    public static final float SPACE_18 = 18f;
    /** 20dp（33 次）。 */
    public static final float SPACE_20 = 20f;
    /** 24dp（15 次）。 */
    public static final float SPACE_24 = 24f;
    /** 26dp（14 次）。 */
    public static final float SPACE_26 = 26f;
    /** 44dp（16 次）：底部安全区 / 大分节。 */
    public static final float SPACE_44 = 44f;

    /* ---- 描边（dp）：用 dp() 后仍被 Math.max(1, ...) 兜到 1px 以上 ---- */
    /** 卡片描边名义值。[测] Theme.java:153 Math.max(1, dp(0.8f))。 */
    public static final float STROKE_CARD = 0.8f;
    /** 发丝线名义值。[测] Theme.java:287 Math.max(1, dp(0.7f))。 */
    public static final float STROKE_HAIRLINE = 0.7f;
    /** 实线描边 1dp。 */
    public static final float STROKE_SOLID = 1f;

    /* ---- 首页 hero（鲸鱼徽章 + 问候语）的尺寸基准 ---- */
    /**
     * 首页鲸鱼徽章的框边长（dp）。
     * [参考] 参考 APK 首页实测墨迹 42.0 x 32.0dp（t-ref.png，1080x1920 @480dpi）；
     * 本项目 PNG 墨迹只占框的 94.8% x 64.1%（ic_brand_logo.png 192px），
     * 取 50dp 框 -> 墨迹 47.3 x 32.0dp，与参考的墨迹高度逐 dp 对齐（宽度差来自两家鲸鱼画法不同）。
     */
    public static final float HERO_LOGO_DP = 50f;
    /**
     * 首页问候语字号（sp）。
     * [参考] 参考首页墨迹高 20.0dp；本项目 17sp 时墨迹 16.3dp -> 20.0/16.3*17 ~= 21sp。
     */
    public static final float HERO_GREET_SP = 21f;
    /**
     * 徽章与问候语之间的间距（dp，上下两块的布局边距），随 heroScale() 一起放大。
     * 定值依据是「墨迹到墨迹」的可见间隔：
     * [参考] 参考首页 logo 墨迹底 813px / 问候语墨迹顶 892px -> 79px = 26.3dp（t-ref.png）；
     * [测] 本项目框底留白 9.4dp + 文本顶留白 6.3dp = 15.7dp，
     * 所以布局边距 = 26.3 - 15.7 = 10.6dp 时两边可见间隔逐 dp 相等（实测 26.3dp）。
     */
    public static final float HERO_GAP_DP = 10.6f;
    /**
     * hero 的光学居中偏置（dp，向上）。
     *
     * 布局框居中 ≠ 墨迹居中：logo 是方形画布里一条扁鲸（墨迹下方留 9.4dp），
     * 问候语 TextView 的墨迹也偏向字框上半部（ascent/descent 不对称）。实测整块墨迹
     * 中心比布局框中心低 2.5dp（480dpi / 1080x1920：墨迹中心 967.5px vs 屏幕中线 960px），
     * 所以居中时把目标中线上提这么多，让“看得到的那团墨”落在屏幕中线上，随 heroScale() 缩放。
     */
    public static final float HERO_INK_BIAS_DP = 8.5f;

    /** hero 自适应比例的下限：小屏不缩小，避免与参考比例偏离。 */
    public static final float HERO_SCALE_MIN = 1f;
    /** hero 自适应比例的上限：平板上最多 1.6 倍，否则会把输入卡片挤得没位置。 */
    public static final float HERO_SCALE_MAX = 1.6f;

    public final boolean dark;
    public final int bg;
    public final int surface;
    public final int surfaceAlt;
    public final int line;
    public final int text;
    public final int muted;
    public final int muted2;
    public final int accent;
    public final int accentSoft;
    public final int onAccent;
    public final int bubble;
    /** 输入卡片的描边（官方：浅 #F0F0F0 / 深 #333333）。 */
    public final int cardStroke;
    /** 输入卡片底色（官方深色不是 surface 而是 #242424）。 */
    public final int cardFill;
    /** composer 上未选中的能力 chip：浅 #EDF3FE 底 + 主色字；深 #283142 底。 */
    public final int chipOff;
    /** composer 上已选中的能力 chip：卡片底色 + 一圈描边，字与图标转成正文色。 */
    public final int chipOnStroke;
    /** 座位 chip 的图标与文字：直接取正文色（与输入卡右侧的功能圆钮同色），随主题自动适配。 */
    public final int chipInk;
    /** 座位 chip 右侧 chevron：比 chipInk 浅一档，但仍明显深于 muted。 */
    public final int chipInk2;
    /** 图片/文件选择面板里的方块底色。 */
    public final int tile;
    public final int ok;
    public final int warn;
    public final int bad;
    public final Context context;
    /** 全局字号缩放（设置里的「字体大小」）。只作用于 >= 14sp 的文字，避免把 chip/图标行撑破。 */
    public final float fontScale;
    /** 骨架屏底色（加载占位块）。TODO(spec)：等 A8 采集定值，先取与 tile 同族的保守值。 */
    public final int skeleton;
    /** 骨架 shimmer 高光色。TODO(spec)。 */
    public final int skeletonHi;
    /** 弹层 / 抽屉遮罩底色：0x99 = 60% 黑，对应 Motion.SCRIM_ALPHA = 0.60f。 */
    public final int scrim;

    private Theme(Context context, boolean dark) {
        this.context = context;
        this.dark = dark;
        this.fontScale = Prefs.fontFollowSystem(context) ? 1.0f : Prefs.fontScale(context);
        if (dark) {
            bg = 0xFF0F0F0F;
            surface = 0xFF141414;
            surfaceAlt = 0xFF1E1E1E;
            line = 0xFF2A2A2A;
            text = 0xFFF8F8F8;
            muted = 0xFFB9BABB;
            muted2 = 0xFF8E9094;
            accent = 0xFF507BF2;
            accentSoft = 0xFF1B2340;
            onAccent = 0xFF0F0F0F;
            bubble = 0xFF283142;
            cardStroke = 0xFF333333;
            cardFill = 0xFF242424;
            chipOff = 0xFF283142;
            chipOnStroke = 0xFF474849;
            chipInk = text;
            chipInk2 = 0xFFC9CACB;
            tile = 0xFF1E1E1E;
            ok = 0xFF22C55E;
            warn = 0xFFF59E0B;
            bad = 0xFFF25A5A;      // 主机 --dsw-alias-state-error-primary(dark) = static-red-400
            skeleton = 0xFF232323;
            skeletonHi = 0xFF2E2E2E;
            scrim = 0x99000000;
        } else {
            bg = 0xFFFFFFFF;
            surface = 0xFFFFFFFF;
            surfaceAlt = 0xFFF3F4F6;
            line = 0xFFE8E8E8;
            text = 0xFF0F0F0F;
            muted = 0xFF7D7F85;
            muted2 = 0xFF8E9094;
            accent = 0xFF426EFE;
            accentSoft = 0xFFE9EEFF;
            onAccent = 0xFFFFFFFF;
            bubble = 0xFFEDF3FE;
            cardStroke = 0xFFF0F0F0;
            cardFill = 0xFFFFFFFF;
            chipOff = 0xFFEDF3FE;
            chipOnStroke = 0xFFEDEDED;
            chipInk = text;
            chipInk2 = 0xFF5A5E66;
            tile = 0xFFF5F5F5;
            ok = 0xFF22C55E;
            warn = 0xFFF59E0B;
            bad = 0xFFD93025;
            skeleton = 0xFFEDEEF0;
            skeletonHi = 0xFFF7F8FA;
            scrim = 0x99000000;
        }
    }

    public static Theme of(Context context) {
        return new Theme(context, Prefs.darkMode(context));
    }

    /**
     * 首页 hero 的自适应放大比例：以 360x640dp 为 1.0 基准（本机 1080x1920 @480dpi 恰为 360x640dp）。
     *
     * <p>宽、高各按自身比例换算后取小值：宽度是文字排版的硬约束（太长会换行），
     * 高度只决定留白，两者都满足才放大；结果夹在 [HERO_SCALE_MIN, HERO_SCALE_MAX]。
     * 只读 DisplayMetrics，不写任何状态，不改任何业务值。
     */
    public float heroScale() {
        DisplayMetrics m = context.getResources().getDisplayMetrics();
        float w = m.widthPixels / m.density;
        float h = m.heightPixels / m.density;
        float s = Math.min(w / 360f, h / 640f);
        if (!(s > HERO_SCALE_MIN)) return HERO_SCALE_MIN;   // 同时兼顾 NaN
        return s > HERO_SCALE_MAX ? HERO_SCALE_MAX : s;
    }

    public int dp(float value) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, context.getResources().getDisplayMetrics());
    }

    public float sp() {
        return context.getResources().getDisplayMetrics().scaledDensity;
    }

    /**
     * 品牌 logo：浅色=黑鲸（ic_brand_logo）、深色=白鲸（ic_brand_logo_dark）。
     * 两份素材同源，只有着色不同；这里靠 dark 资源选择而不是给 ImageView 上 tint，
     * 是为了保留 PNG 自身的透明通道与线稿细节。
     */
    public int brandLogo() {
        return dark ? R.drawable.ic_brand_logo_dark : R.drawable.ic_brand_logo;
    }

    /** 启动页 logo：与品牌 logo 同一套两色素材（96dp 同构三份，夜间另有 drawable-night 兜底）。 */
    public int splashLogo() {
        return dark ? R.drawable.ic_splash_logo_dark : R.drawable.ic_splash_logo;
    }

    /* ---------------------------------------------------------------- */
    /* drawable                                                          */
    /* ---------------------------------------------------------------- */

    public GradientDrawable round(int color, float radiusDp) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(color);
        d.setCornerRadius(dp(radiusDp));
        return d;
    }

    public GradientDrawable roundStroke(int color, int stroke, float radiusDp) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(color);
        d.setStroke(Math.max(1, dp(0.8f)), stroke);
        d.setCornerRadius(dp(radiusDp));
        return d;
    }

    public GradientDrawable pill(int color) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(color);
        d.setCornerRadius(dp(999));
        return d;
    }

    /** 点按水波纹背景（API 21+）。 */
    public android.graphics.drawable.RippleDrawable ripple(float radiusDp) {
        GradientDrawable mask = round(0xFFFFFFFF, radiusDp);
        int color = android.graphics.Color.argb((int) (255 * (dark ? 0.16f : 0.10f)),
                android.graphics.Color.red(text), android.graphics.Color.green(text), android.graphics.Color.blue(text));
        return new android.graphics.drawable.RippleDrawable(android.content.res.ColorStateList.valueOf(color), null, mask);
    }

    /** 带底色的点按水波纹（上传面板方块用）。 */
    public android.graphics.drawable.RippleDrawable rippleOn(int fill, float radiusDp) {
        int color = android.graphics.Color.argb((int) (255 * (dark ? 0.16f : 0.10f)),
                android.graphics.Color.red(text), android.graphics.Color.green(text),
                android.graphics.Color.blue(text));
        return new android.graphics.drawable.RippleDrawable(
                android.content.res.ColorStateList.valueOf(color),
                round(fill, radiusDp), round(0xFFFFFFFF, radiusDp));
    }

    /** 带底色 + 描边的点按水波纹（座位 chip / 描边容器必须保留边线，不能改用 rippleOn 丢描边）。 */
    public android.graphics.drawable.RippleDrawable rippleOnStroke(int fill, int stroke, float radiusDp) {
        int color = android.graphics.Color.argb((int) (255 * (dark ? 0.16f : 0.10f)),
                android.graphics.Color.red(text), android.graphics.Color.green(text),
                android.graphics.Color.blue(text));
        return new android.graphics.drawable.RippleDrawable(
                android.content.res.ColorStateList.valueOf(color),
                roundStroke(fill, stroke, radiusDp), round(0xFFFFFFFF, radiusDp));
    }

    public GradientDrawable circle(int color) {
        GradientDrawable d = new GradientDrawable();
        d.setShape(GradientDrawable.OVAL);
        d.setColor(color);
        return d;
    }

    /* ---------------------------------------------------------------- */
    /* 控件                                                              */
    /* ---------------------------------------------------------------- */

    public TextView text(String value, float sizeSp, int color) {
        TextView view = new TextView(context);
        view.setText(value == null ? "" : value);
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp >= 14f ? sizeSp * fontScale : sizeSp);
        view.setTextColor(color);
        view.setLineSpacing(dp(4), 1f);
        view.setIncludeFontPadding(false);
        return view;
    }

    public TextView strong(String value, float sizeSp, int color) {
        TextView view = text(value, sizeSp, color);
        view.setTypeface(Typeface.DEFAULT_BOLD);
        return view;
    }

    public TextView mono(String value, float sizeSp, int color) {
        TextView view = text(value, sizeSp, color);
        view.setTypeface(Typeface.MONOSPACE);
        return view;
    }

    /** 用一张矢量图标做按钮。 */
    public ImageView icon(int resId, int color, int sizeDp) {
        ImageView view = new ImageView(context);
        view.setImageResource(resId);
        view.setColorFilter(color);
        view.setScaleType(ImageView.ScaleType.FIT_CENTER);
        int box = dp(sizeDp);
        view.setLayoutParams(new LinearLayout.LayoutParams(box, box));
        view.setPadding(0, 0, 0, 0);
        return view;
    }

    /** 可点的圆形图标按钮（带触摸区）。 */
    public android.widget.FrameLayout iconButton(int resId, int color, int sizeDp, int touchDp) {
        android.widget.FrameLayout holder = new android.widget.FrameLayout(context);
        holder.setLayoutParams(new LinearLayout.LayoutParams(dp(touchDp), dp(touchDp)));
        ImageView image = new ImageView(context);
        image.setImageResource(resId);
        image.setColorFilter(color);
        int box = dp(sizeDp);
        android.widget.FrameLayout.LayoutParams inner =
                new android.widget.FrameLayout.LayoutParams(box, box, Gravity.CENTER);
        holder.addView(image, inner);
        holder.setClickable(true);
        holder.setFocusable(true);
        holder.setBackground(roundStroke(0x00000000, 0x00000000, 10f));
        return holder;
    }

    public LinearLayout column() {
        LinearLayout layout = new LinearLayout(context);
        layout.setOrientation(LinearLayout.VERTICAL);
        return layout;
    }

    public LinearLayout row() {
        LinearLayout layout = new LinearLayout(context);
        layout.setOrientation(LinearLayout.HORIZONTAL);
        layout.setGravity(Gravity.CENTER_VERTICAL);
        return layout;
    }

    public static LinearLayout.LayoutParams lp(int width, int height) {
        return new LinearLayout.LayoutParams(width, height);
    }

    public static void margin(View view, int left, int top, int right, int bottom) {
        ViewGroup.LayoutParams raw = view.getLayoutParams();
        if (raw instanceof ViewGroup.MarginLayoutParams) {
            ((ViewGroup.MarginLayoutParams) raw).setMargins(left, top, right, bottom);
            view.setLayoutParams(raw);
        }
    }

    public static void pad(View view, int left, int top, int right, int bottom) {
        view.setPadding(left, top, right, bottom);
    }

    public static void weight(View view, float weight) {
        ViewGroup.LayoutParams raw = view.getLayoutParams();
        if (raw instanceof LinearLayout.LayoutParams) {
            ((LinearLayout.LayoutParams) raw).weight = weight;
            ((LinearLayout.LayoutParams) raw).width = 0;
            view.setLayoutParams(raw);
        }
    }

    /** 一条 1px 分隔线。 */
    public View hairline() {
        View line = new View(context);
        line.setBackgroundColor(this.line);
        line.setLayoutParams(new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, Math.max(1, dp(0.7f))));
        return line;
    }

    public static int alpha(int color, float factor) {
        int a = (int) (Color.alpha(color) * factor);
        return Color.argb(a, Color.red(color), Color.green(color), Color.blue(color));
    }
}
