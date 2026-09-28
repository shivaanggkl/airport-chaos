package com.vadensoftware.airportchaos.nativeauth;

import android.content.MutableContextWrapper;
import android.os.CancellationSignal;
import androidx.credentials.ClearCredentialStateRequest;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.ClearCredentialException;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialException;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

@CapacitorPlugin(name = "NativeIdentity")
public final class NativeAuthPlugin extends Plugin {
    private CredentialManager credentialManager;

    @Override
    public void load() {
        credentialManager = CredentialManager.create(getContext());
    }

    @PluginMethod
    public void authenticate(PluginCall call) {
        String provider = call.getString("provider");
        String nonce = call.getString("nonce");
        String serverClientId = call.getString("serverClientId");
        if (!"google".equals(provider) || nonce == null || nonce.length() < 32 || serverClientId == null || serverClientId.isBlank()) {
            call.reject("Google sign-in is not configured.");
            return;
        }

        GetSignInWithGoogleOption option = new GetSignInWithGoogleOption.Builder(serverClientId)
            .setNonce(nonce)
            .build();
        GetCredentialRequest request = new GetCredentialRequest.Builder()
            .addCredentialOption(option)
            .build();
        MutableContextWrapper activityContext = new MutableContextWrapper(getActivity());
        credentialManager.getCredentialAsync(
            activityContext,
            request,
            new CancellationSignal(),
            getActivity().getMainExecutor(),
            new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                @Override
                public void onResult(GetCredentialResponse result) {
                    resolveGoogleCredential(call, result.getCredential());
                }

                @Override
                public void onError(GetCredentialException error) {
                    if (error instanceof GetCredentialCancellationException) {
                        JSObject cancelled = new JSObject();
                        cancelled.put("cancelled", true);
                        call.resolve(cancelled);
                    } else {
                        call.reject("Google sign-in failed.");
                    }
                }
            }
        );
    }

    private void resolveGoogleCredential(PluginCall call, Credential credential) {
        if (!(credential instanceof CustomCredential) ||
            !GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(credential.getType())) {
            call.reject("Google sign-in failed.");
            return;
        }
        try {
            GoogleIdTokenCredential google = GoogleIdTokenCredential.createFrom(credential.getData());
            JSObject result = new JSObject();
            result.put("idToken", google.getIdToken());
            call.resolve(result);
        } catch (RuntimeException error) {
            call.reject("Google sign-in failed.");
        }
    }

    @PluginMethod
    public void signOut(PluginCall call) {
        credentialManager.clearCredentialStateAsync(
            new ClearCredentialStateRequest(),
            null,
            getContext().getMainExecutor(),
            new CredentialManagerCallback<Void, ClearCredentialException>() {
                @Override
                public void onResult(Void ignored) {
                    call.resolve();
                }

                @Override
                public void onError(ClearCredentialException error) {
                    call.resolve();
                }
            }
        );
    }
}
