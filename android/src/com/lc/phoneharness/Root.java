package com.lc.phoneharness;

import android.content.Context;
import android.util.TypedValue;
import android.view.MotionEvent;
import android.widget.FrameLayout;

/** 支持「从左边往右划拉出抽屉」的根容器：只有起手点贴在左边缘才接管手势。 */
public final class Root extends FrameLayout {

    public interface Swipe {
        void drag(float dx);
        void release(float dx);
    }

    private Swipe swipe;
    private boolean tracking;
    private float downX;
    private float downY;
    private final int edge;
    private final int slop;

    public Root(Context context) {
        super(context);
        edge = (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, 26, context.getResources().getDisplayMetrics());
        slop = (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, 10, context.getResources().getDisplayMetrics());
    }

    public void setSwipe(Swipe callback) {
        this.swipe = callback;
    }

    @Override
    public boolean dispatchTouchEvent(MotionEvent event) {
        if (swipe == null) return super.dispatchTouchEvent(event);
        switch (event.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                downX = event.getX();
                downY = event.getY();
                tracking = downX <= edge;
                break;
            case MotionEvent.ACTION_MOVE: {
                if (!tracking) break;
                float dx = event.getX() - downX;
                float dy = event.getY() - downY;
                if (Math.abs(dy) > Math.abs(dx) * 1.4f) {
                    tracking = false;
                    break;
                }
                if (dx > slop) {
                    swipe.drag(dx);
                    return true;
                }
                break;
            }
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL: {
                if (tracking) {
                    tracking = false;
                    swipe.release(event.getX() - downX);
                    if (event.getX() - downX > slop) return true;
                }
                break;
            }
            default:
                break;
        }
        return super.dispatchTouchEvent(event);
    }
}
