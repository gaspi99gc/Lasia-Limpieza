-- Altas de cuenta bancaria: dos campos en el legajo.
--
-- Todos los meses hay que mandarle al banco un Excel con los operarios nuevos
-- para que les abran la cuenta donde cobran. Hoy ese archivo se arma a mano:
-- hay que acordarse de quien ya se mando y quien no, y el criterio real no es
-- "los que entraron este mes" sino "los que siguen trabajando y todavia no
-- tienen cuenta" (en el envio de agosto, de 63 ingresos de julio se mandaron
-- 21: los otros 42 ya se habian ido).
--
-- Sin registrar quien se mando no hay forma confiable de saber donde cortar, y
-- eso es lo que arreglan estas dos columnas.
--
-- Correr en: Supabase Dashboard -> SQL Editor -> pegar y Run. Es idempotente.

-- Cuando se lo incluyo en un envio al banco. NULL = todavia no se mando.
--
-- Se guarda la FECHA y no un simple si/no para poder reconstruir que se mando
-- en cada tanda si el banco pregunta por una vieja.
ALTER TABLE employees
    ADD COLUMN IF NOT EXISTS alta_banco_enviada_at DATE;

-- Fecha de nacimiento: la pide el formulario del banco y el legajo no la tenia.
--
-- Queda NULL en los legajos ya cargados; en el Excel esos salen con "-", que es
-- exactamente lo que se venia haciendo a mano (5 de los 45 del envio de agosto
-- iban asi). Se completa al dar de alta a los nuevos.
ALTER TABLE employees
    ADD COLUMN IF NOT EXISTS fecha_nacimiento DATE;

-- Para listar rapido a quien falta mandar. Parcial: solo interesan los que
-- NO se enviaron todavia, que son unos pocos por mes contra 500+ legajos.
CREATE INDEX IF NOT EXISTS idx_employees_alta_banco_pendiente
    ON employees (fecha_ingreso)
    WHERE alta_banco_enviada_at IS NULL;
