package com.cumu.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material.icons.rounded.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import com.cumu.app.CumuApplication
import com.cumu.app.data.LoginResult
import kotlinx.coroutines.launch

@Composable
fun LoginScreen() {
    val app = CumuApplication.instance
    val scope = rememberCoroutineScope()
    var server by remember { mutableStateOf(app.sessions.lastServer) }
    var user by remember { mutableStateOf(app.sessions.lastUsername) }
    var pass by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var needCode by remember { mutableStateOf(false) }
    var showPass by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    fun submit() {
        if (busy) return
        if (server.isBlank() || user.isBlank() || pass.isEmpty()) {
            error = "Bitte Server, Benutzername und Passwort eingeben."
            return
        }
        busy = true; error = null
        scope.launch {
            when (val r = app.api.login(server, user, pass, code.takeIf { needCode && it.isNotBlank() })) {
                is LoginResult.Success -> Unit // session flow switches to the app
                is LoginResult.AdminCodeRequired -> {
                    needCode = true
                    code = ""
                    error = if (r.invalid) "Admin-Code ist falsch."
                    else "Admin-Konto: Bitte den Admin-Code eingeben (ADMIN_LOGIN_CODE aus der .env des Servers). Das Handy merkt ihn sich 30 Tage."
                }
                is LoginResult.Error -> error = r.message
            }
            busy = false
        }
    }

    Surface(Modifier.fillMaxSize()) {
        Column(
            Modifier
                .fillMaxSize()
                .systemBarsPadding()
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            androidx.compose.foundation.Image(
                androidx.compose.ui.res.painterResource(com.cumu.app.R.drawable.cumu_logo), null,
                Modifier.size(140.dp),
            )
            Text("cumu", style = MaterialTheme.typography.displaySmall, fontWeight = FontWeight.Bold)
            Text(
                "Mit deinem cumu-Server verbinden",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(32.dp))

            val fieldMod = Modifier.fillMaxWidth().widthIn(max = 480.dp)
            OutlinedTextField(
                server, { server = it }, fieldMod,
                label = { Text("Server-Adresse") },
                placeholder = { Text("192.168.1.10:3000") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Next),
            )
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                user, { user = it }, fieldMod,
                label = { Text("Benutzername") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
            )
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                pass, { pass = it }, fieldMod,
                label = { Text("Passwort") },
                singleLine = true,
                visualTransformation = if (showPass) VisualTransformation.None else PasswordVisualTransformation(),
                trailingIcon = {
                    IconButton(onClick = { showPass = !showPass }) {
                        Icon(if (showPass) Icons.Rounded.VisibilityOff else Icons.Rounded.Visibility, "Passwort anzeigen")
                    }
                },
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Password,
                    imeAction = if (needCode) ImeAction.Next else ImeAction.Done,
                ),
                keyboardActions = KeyboardActions(onDone = { submit() }),
            )
            if (needCode) {
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    code, { code = it }, fieldMod,
                    label = { Text("Admin-Code") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { submit() }),
                )
            }
            error?.let {
                Text(it, fieldMod.padding(top = 12.dp), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
            }
            Spacer(Modifier.height(24.dp))
            Button(onClick = ::submit, enabled = !busy, modifier = fieldMod.height(48.dp)) {
                if (busy) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                else Text("Anmelden")
            }
        }
    }
}
