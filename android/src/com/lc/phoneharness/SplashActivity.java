package com.lc.phoneharness;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * 启动界面：品牌 logo + 名称 + 版本号，短暂停留后进入主界面。
 * 品牌图由 brand/make-assets.py 从源图生成（白底转透明、按密度出图）。
 */
public class SplashActivity extends Activity {

    /** attach 阶段定下的语言：onResume 用它判断界面是否需要重建（与主题的 darkAtBuild 同一套做法）。 */
    private String langAtBuild;

    @Override
    protected void attachBaseContext(Context base) {
        super.attachBaseContext(Langs.wrap(base));
        langAtBuild = Langs.current(base);
    }

    private static final long HOLD_MS = 620L;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // 启动页只在屏幕上停 HOLD_MS(620ms)，而且「外观」只能在设置页改，改的时候它不可能在前台，
        // 所以这里只取一次主题：不补 MainActivity 那套 darkAtBuild/recreate —— 补了反而会在启动途中重建、露两帧。
        Theme t = Theme.of(this);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(t.bg);

        LinearLayout column = t.column();
        column.setGravity(Gravity.CENTER);

        ImageView logo = new ImageView(this);
        logo.setImageResource(t.splashLogo());
        logo.setScaleType(ImageView.ScaleType.FIT_CENTER);
        column.addView(logo, new LinearLayout.LayoutParams(t.dp(96), t.dp(96)));

        TextView name = t.strong(App.NAME, 18f, t.text);
        name.setGravity(Gravity.CENTER);
        Theme.margin(name, 0, t.dp(18), 0, 0);
        column.addView(name);

        TextView version = t.text("v" + App.versionName(this), 12f, t.muted);
        version.setGravity(Gravity.CENTER);
        Theme.margin(version, 0, t.dp(6), 0, 0);
        column.addView(version);

        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT);
        root.addView(column, lp);
        setContentView(root);

        // 动效令牌：logo / 名称 / 版本错峰入场（0/1/2 步，步长 Motion.STAGGER_STEP）。
        // 注意：HOLD_MS(620ms) 是业务节奏（决定停在启动页多久），不是动效参数，**不动它**；
        // 入场总时长 = 延迟(<=80ms) + 淡入(150ms) << 620ms，不会挤到切页。
        View[] marks = new View[] { logo, name, version };
        float step = Motion.reducedMotion(this) ? 0f : t.dp(8f);
        for (int index = 0; index < marks.length; index++) {
            Motion.staggerIn(marks[index], index, step).start();
        }

        getWindow().setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(t.bg));
        if (getWindow() != null) {
            getWindow().setFlags(WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS, 0);
        }

        root.postDelayed(new Runnable() {
            @Override
            public void run() {
                go();
            }
        }, HOLD_MS);
        root.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                go();
            }
        });
    }

    private boolean moved;

    private void go() {
        if (moved) return;
        moved = true;
        // 固定落点：每次从桌面图标进入都清掉旧任务栈，直接回首页「新对话」页，
        // 不再恢复上次停在的会话页（FLAG_ACTIVITY_CLEAR_TASK 需要配合 NEW_TASK 才生效）。
        Intent next = new Intent(SplashActivity.this, MainActivity.class);
        next.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        startActivity(next);
        Nav.none(this);
        finish();
    }
}
