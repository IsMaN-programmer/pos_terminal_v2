package uz.posvk.posterminal;

import com.getcapacitor.BridgeActivity;
import android.view.View;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WindowInsetsControllerCompat systemBars = new WindowInsetsControllerCompat(getWindow(), getWindow().getDecorView());
        systemBars.setAppearanceLightStatusBars(true);
        systemBars.setAppearanceLightNavigationBars(true);
        getWindow().setStatusBarColor(android.graphics.Color.rgb(248, 250, 252));
        getWindow().setNavigationBarColor(android.graphics.Color.WHITE);
        View webView = getBridge().getWebView();
        if (webView.getParent() instanceof View) {
            View container = (View) webView.getParent();
            ViewCompat.setOnApplyWindowInsetsListener(container, (view, windowInsets) -> {
                int types = WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout();
                Insets bars = windowInsets.getInsets(types);
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return new WindowInsetsCompat.Builder(windowInsets)
                    .setInsets(types, Insets.NONE)
                    .build();
            });
            ViewCompat.requestApplyInsets(container);
        }
    }
}
