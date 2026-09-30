package com.vadensoftware.airportchaos.nativeauth;

import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Collections;
import java.util.List;

@CapacitorPlugin(name = "NativePurchase")
public final class NativePurchasePlugin extends Plugin implements PurchasesUpdatedListener {
    private static final String FIREHAWK_PRODUCT_ID = "firehawk";
    private BillingClient billingClient;
    private PluginCall pendingPurchaseCall;

    @Override
    public void load() {
        billingClient = BillingClient.newBuilder(getContext())
            .setListener(this)
            .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
            .build();
    }

    @Override
    protected void handleOnDestroy() {
        if (billingClient != null && billingClient.isReady()) billingClient.endConnection();
        super.handleOnDestroy();
    }

    @PluginMethod
    public void getProduct(PluginCall call) {
        String productId = validProductId(call);
        if (productId == null) return;
        withProduct(call, productId, product -> {
            ProductDetails.OneTimePurchaseOfferDetails offer = firstOffer(product);
            if (offer == null) {
                call.reject("Firehawk is unavailable from Google Play.");
                return;
            }
            JSObject result = new JSObject();
            result.put("productId", product.getProductId());
            result.put("localizedPrice", offer.getFormattedPrice());
            result.put("displayName", product.getName());
            call.resolve(result);
        });
    }

    @PluginMethod
    public void purchase(PluginCall call) {
        String productId = validProductId(call);
        String accountId = call.getString("storeAccountId");
        if (productId == null) return;
        if (accountId == null || !accountId.matches("^[A-Za-z0-9_-]{32,64}$")) {
            call.reject("Purchase configuration is invalid.");
            return;
        }
        if (pendingPurchaseCall != null) {
            call.reject("Another purchase is already active.");
            return;
        }
        withProduct(call, productId, product -> {
            ProductDetails.OneTimePurchaseOfferDetails offer = firstOffer(product);
            if (offer == null) {
                call.reject("Firehawk is unavailable from Google Play.");
                return;
            }
            BillingFlowParams.ProductDetailsParams.Builder details = BillingFlowParams.ProductDetailsParams.newBuilder()
                .setProductDetails(product);
            if (offer.getOfferToken() != null && !offer.getOfferToken().isBlank()) details.setOfferToken(offer.getOfferToken());
            BillingFlowParams params = BillingFlowParams.newBuilder()
                .setProductDetailsParamsList(Collections.singletonList(details.build()))
                .setObfuscatedAccountId(accountId)
                .build();
            pendingPurchaseCall = call;
            BillingResult launch = billingClient.launchBillingFlow(getActivity(), params);
            if (launch.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                pendingPurchaseCall = null;
                call.reject("Unable to open Google Play purchase.");
            }
        });
    }

    @PluginMethod
    public void restore(PluginCall call) {
        String productId = validProductId(call);
        if (productId == null) return;
        ensureConnected(call, () -> billingClient.queryPurchasesAsync(
            QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build(),
            (result, purchases) -> {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    call.reject("Unable to restore purchases.");
                    return;
                }
                for (Purchase purchase : purchases) {
                    if (purchase.getProducts().contains(productId) && purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
                        call.resolve(purchasePayload(purchase, productId));
                        return;
                    }
                }
                JSObject empty = new JSObject();
                empty.put("state", "notFound");
                empty.put("productId", productId);
                call.resolve(empty);
            }
        ));
    }

    @PluginMethod
    public void finish(PluginCall call) {
        call.resolve();
    }

    @Override
    public void onPurchasesUpdated(BillingResult result, List<Purchase> purchases) {
        PluginCall call = pendingPurchaseCall;
        pendingPurchaseCall = null;
        if (call == null) return;
        if (result.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) {
            JSObject cancelled = new JSObject();
            cancelled.put("state", "cancelled");
            cancelled.put("productId", FIREHAWK_PRODUCT_ID);
            call.resolve(cancelled);
            return;
        }
        if (result.getResponseCode() != BillingClient.BillingResponseCode.OK || purchases == null) {
            call.reject("Google Play purchase failed.");
            return;
        }
        for (Purchase purchase : purchases) {
            if (!purchase.getProducts().contains(FIREHAWK_PRODUCT_ID)) continue;
            if (purchase.getPurchaseState() == Purchase.PurchaseState.PENDING) {
                JSObject pending = new JSObject();
                pending.put("state", "pending");
                pending.put("productId", FIREHAWK_PRODUCT_ID);
                call.resolve(pending);
                return;
            }
            if (purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
                call.resolve(purchasePayload(purchase, FIREHAWK_PRODUCT_ID));
                return;
            }
        }
        call.reject("Google Play did not return a completed purchase.");
    }

    private JSObject purchasePayload(Purchase purchase, String productId) {
        JSObject payload = new JSObject();
        payload.put("state", "purchased");
        payload.put("productId", productId);
        payload.put("transactionId", purchase.getOrderId());
        payload.put("purchaseToken", purchase.getPurchaseToken());
        payload.put("acknowledged", purchase.isAcknowledged());
        return payload;
    }

    private ProductDetails.OneTimePurchaseOfferDetails firstOffer(ProductDetails product) {
        List<ProductDetails.OneTimePurchaseOfferDetails> offers = product.getOneTimePurchaseOfferDetailsList();
        return offers == null || offers.isEmpty() ? null : offers.get(0);
    }

    private void withProduct(PluginCall call, String productId, ProductCallback callback) {
        ensureConnected(call, () -> {
            QueryProductDetailsParams.Product product = QueryProductDetailsParams.Product.newBuilder()
                .setProductId(productId)
                .setProductType(BillingClient.ProductType.INAPP)
                .build();
            QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
                .setProductList(Collections.singletonList(product))
                .build();
            billingClient.queryProductDetailsAsync(params, (result, details) -> {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK || details.getProductDetailsList().isEmpty()) {
                    call.reject("Firehawk is unavailable from Google Play.");
                    return;
                }
                callback.accept(details.getProductDetailsList().get(0));
            });
        });
    }

    private void ensureConnected(PluginCall call, Runnable ready) {
        if (billingClient.isReady()) {
            ready.run();
            return;
        }
        billingClient.startConnection(new BillingClientStateListener() {
            @Override public void onBillingSetupFinished(BillingResult result) {
                if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) ready.run();
                else call.reject("Google Play is unavailable.");
            }
            @Override public void onBillingServiceDisconnected() { }
        });
    }

    private String validProductId(PluginCall call) {
        String productId = call.getString("productId");
        if (!FIREHAWK_PRODUCT_ID.equals(productId)) {
            call.reject("Unknown product.");
            return null;
        }
        return productId;
    }

    private interface ProductCallback { void accept(ProductDetails product); }
}
