package com.lc.phoneharness;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;

import java.io.File;
import java.io.FileNotFoundException;

/**
 * 给系统相机写「拍照」结果用的最小 ContentProvider。
 *
 * 相机 App 只有在 EXTRA_OUTPUT 是 content:// 时才会把原图写回来；这个工程没有 androidx，
 * 用不了 FileProvider，所以自己实现 openFile：只放行 cacheDir/shots 下的裸文件名，
 * 带路径分隔符或 .. 的一律拒绝。
 */
public final class Shot extends ContentProvider {

    public static final String AUTHORITY = "com.lc.phoneharness.shot";

    public static File dir(Context context) {
        File dir = new File(context.getCacheDir(), "shots");
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    public static Uri uriFor(File file) {
        return new Uri.Builder().scheme("content").authority(AUTHORITY)
                .appendPath(file.getName()).build();
    }

    @Override
    public boolean onCreate() {
        return true;
    }

    @Override
    public String getType(Uri uri) {
        return "image/jpeg";
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        File file = resolve(uri);
        int flags;
        if (mode != null && mode.contains("w")) {
            flags = ParcelFileDescriptor.MODE_WRITE_ONLY
                    | ParcelFileDescriptor.MODE_CREATE
                    | ParcelFileDescriptor.MODE_TRUNCATE;
        } else {
            flags = ParcelFileDescriptor.MODE_READ_ONLY;
        }
        return ParcelFileDescriptor.open(file, flags);
    }

    private File resolve(Uri uri) throws FileNotFoundException {
        String name = uri.getLastPathSegment();
        if (name == null || name.length() == 0
                || name.indexOf('/') >= 0
                || name.indexOf('\\') >= 0
                || name.contains("..")) {
            throw new FileNotFoundException("bad shot name: " + name);
        }
        Context context = getContext();
        if (context == null) throw new FileNotFoundException("no context");
        return new File(dir(context), name);
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        return null;
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        return null;
    }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {
        return 0;
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
        return 0;
    }
}
