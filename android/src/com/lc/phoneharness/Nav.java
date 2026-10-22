package com.lc.phoneharness;

import android.app.Activity;
import android.content.Intent;
import android.os.Build;

/**
 * 页面转场：全 App 统一的「右进 / 右出」动画。
 *
 * 为什么不能只用 overridePendingTransition：Android 14（API 34）起，targetSdk ≥ 34 的应用调用
 * {@code overridePendingTransition} 不再生效（系统改为接管转场），结果就是页面「硬切」——
 * 实测：把系统动画缩放调到 5 倍，配对页返回时仍是一帧内完成，而应用内的抽屉动画正常可见。
 * API 33+ 必须改用 {@link Activity#overrideActivityTransition}，低版本继续走旧接口。
 */
final class Nav {

    private Nav() {
    }

    /** 打开下一页：startActivity + 右进动画。 */
    static void open(Activity from, Intent intent) {
        from.startActivity(intent);
        openAnim(from);
    }

    /** 只设「打开」动画（自己已调过 startActivity 时用）。 */
    static void openAnim(Activity activity) {
        if (Build.VERSION.SDK_INT >= 33) {
            activity.overrideActivityTransition(Activity.OVERRIDE_TRANSITION_OPEN,
                    R.anim.nav_enter, R.anim.nav_push_out);
        } else {
            activity.overridePendingTransition(R.anim.nav_enter, R.anim.nav_push_out);
        }
    }

    /** 用下一页替换当前页（当前页立刻结束）：下一页右进、当前页右出，两段动画都设上。 */
    static void replace(Activity activity, Intent intent) {
        activity.startActivity(intent);
        openAnim(activity);
        activity.finish();
        closeAnim(activity);
    }

    /** 退回上一页：finish + 右出动画（与进入方向对称）。 */
    static void close(Activity activity) {
        activity.finish();
        closeAnim(activity);
    }

    /** 只设「关闭」动画（自己已调过 finish 时用）。 */
    static void closeAnim(Activity activity) {
        if (Build.VERSION.SDK_INT >= 33) {
            activity.overrideActivityTransition(Activity.OVERRIDE_TRANSITION_CLOSE,
                    R.anim.nav_pop_in, R.anim.nav_pop_out);
        } else {
            activity.overridePendingTransition(R.anim.nav_pop_in, R.anim.nav_pop_out);
        }
    }

    /** 无动画（启动页 → 首页这种不需要转场的地方）。 */
    static void none(Activity activity) {
        if (Build.VERSION.SDK_INT >= 33) {
            activity.overrideActivityTransition(Activity.OVERRIDE_TRANSITION_OPEN, 0, 0);
        } else {
            activity.overridePendingTransition(0, 0);
        }
    }
}
